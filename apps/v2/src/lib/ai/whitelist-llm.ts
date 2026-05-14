import { z } from "zod";
import { generate } from "./gemini";
import type { WhitelistLocale } from "./whitelist-keywords";

// Stage 2 of the two-stage Whitelist (master plan §2-2): when the
// keyword pass let a message through, ask Gemini Flash itself how
// to route it. The classifier is invoked in JSON mode so we get a
// structured response we can trust to parse.
//
// Three-way categorisation:
//   individual — asks for personalised legal/tax/visa/labour advice
//                → escalate to a human expert (master plan §2-2).
//   general    — asks for general public info that any qualified
//                professional would answer the same way for everyone
//                → answer + RAG citations.
//   smalltalk  — greetings, acknowledgements, off-topic remarks,
//                or input too short / ambiguous to be a real
//                question. Treated as "out of scope, here's what I
//                can help with" — no escalation noise, no LLM
//                answer call, no quota consumed.
//
// Fail-safe policy: anything that goes wrong here — Gemini error,
// timeout, malformed JSON, missing fields, unknown enum value —
// collapses to category="individual" so the user is escalated to a
// human. The cost of an unnecessary escalation is a UX wrinkle; the
// cost of a missed escalation is the system answering personal
// legal questions. (Master plan §9 #1, #2.)
//
// Borderline bias: the prompt instructs the model to choose
// `general` or `smalltalk` ONLY when confident; anything ambiguous
// between individual-vs-other defaults to `individual`. This keeps
// the W4 偽陽性 bias intact while letting genuine smalltalk skip
// escalation.

export type ClassifierCategory = "individual" | "general" | "smalltalk";

export const ClassifierResponseSchema = z.object({
  category: z.enum(["individual", "general", "smalltalk"]),
  // Reason is bounded so a runaway LLM explanation cannot bloat logs
  // or `messages.whitelist_decision` JSONB.
  reason: z.string().min(1).max(500),
});

export type ClassifierParsed =
  | { ok: true; category: ClassifierCategory; reason: string }
  | { ok: false; failsafe: true; error: string };

/**
 * Pure parser: Gemini text response -> validated classifier payload.
 * Kept separate from the network call so it stays trivial to unit
 * test without mocking the SDK.
 */
export function parseClassifierResponse(text: string): ClassifierParsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, failsafe: true, error: "invalid_json" };
  }
  const parsed = ClassifierResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      failsafe: true,
      error: `schema_violation:${parsed.error.issues[0]?.path.join(".") ?? "?"}`,
    };
  }
  return {
    ok: true,
    category: parsed.data.category,
    reason: parsed.data.reason,
  };
}

const SYSTEM_PROMPT = `You are a router for a foreigner-support chat in Japan.

Classify the user's message into exactly ONE of three categories:

  "individual" — the user is asking about THEIR OWN legal, tax,
                 immigration, labour, or family situation, or asking
                 for advice that depends on personal facts.
                 Examples:
                   "My visa expires next month, can I still apply?"
                   "My employer didn't pay overtime, can I sue?"
                   "I want to divorce my husband."
                   "在留期限が切れた人はどうなりますか？"
                   "Tinanggal ako sa trabaho kahapon."

  "general"    — the user is asking for PUBLIC INFORMATION that any
                 qualified professional would answer the same way
                 for everyone (no personal facts needed).
                 Examples:
                   "How long is a Working Visa valid?"
                   "What documents are required to renew a Spouse Visa?"
                   "国民年金と厚生年金の違いは？"
                   "Anong dokumento ang kailangan para sa visa?"

  "smalltalk"  — the message is a greeting, acknowledgement,
                 thank-you, weather/chitchat, single-word utterance,
                 or otherwise NOT a substantive question this service
                 can answer (immigration / health insurance / school /
                 admin procedures / family / restaurants).
                 Examples:
                   "ああ" / "うん" / "ok"
                   "こんにちは" / "Hello" / "Kumusta"
                   "ありがとう" / "Thanks" / "Salamat"
                   "良いお天気ですね"
                   "test" / "asdf"

DECISION BIAS — important:
  - When uncertain between "individual" and ANY other category,
    pick "individual". Letting a personal-advice request slip
    through as "general" or "smalltalk" creates real legal exposure;
    the opposite mistake is just a UX wrinkle.
  - Pick "general" only when you are confident it is not personal.
  - Pick "smalltalk" only when the message clearly has no question
    this service can answer.

Reply with JSON only, no prose, matching this exact schema:
  {"category": "individual"|"general"|"smalltalk", "reason": "<one short English sentence>"}`;

// JSON schema mirroring ClassifierResponseSchema. Gemini's structured
// output enforces this on the model side as a second line of defence
// in addition to our Zod parse.
const RESPONSE_SCHEMA = {
  type: "object",
  required: ["category", "reason"],
  properties: {
    category: {
      type: "string",
      enum: ["individual", "general", "smalltalk"],
    },
    reason: { type: "string" },
  },
} as const;

export interface ClassifierResult {
  category: ClassifierCategory;
  reason: string;
  /** True when classification fell back to safe-default (escalate). */
  failsafe: boolean;
  /** Reason the failsafe fired, if any. */
  failsafeError?: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Ask Gemini Flash to route the message into individual / general /
 * smalltalk. On any error or malformed response, returns a
 * safe-default `category="individual"` result so the caller routes to
 * escalation.
 *
 * The locale parameter is passed for future use (logging / per-locale
 * prompt tuning); the prompt itself stays language-agnostic so the
 * model handles multilingual input uniformly.
 */
export async function classifyIndividualLLM(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _locale: WhitelistLocale,
): Promise<ClassifierResult> {
  const start = Date.now();
  try {
    const result = await generate(message, {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Disable thinking so the entire output budget is spent on the
      // structured JSON. Without this, Gemini 2.5 Flash burns the
      // budget on internal reasoning and stops at MAX_TOKENS with a
      // truncated "Here is the JSON:" string — observed in dev on
      // 2026-05-14 (commit 72829f6 follow-up). Classifier wants
      // determinism, not depth, so budget=0 is the right knob.
      thinkingBudget: 0,
      // Headroom: a clean classification needs ~30 output tokens, but
      // bump the cap so a slightly verbose `reason` field still fits.
      maxOutputTokens: 500,
    });
    const parsed = parseClassifierResponse(result.text);
    if (!parsed.ok) {
      console.warn(
        `[whitelist-llm] failsafe error=${parsed.error} text=${result.text.slice(0, 200)}`,
      );
      return {
        category: "individual",
        reason: `failsafe:${parsed.error}`,
        failsafe: true,
        failsafeError: parsed.error,
        latencyMs: result.latencyMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      };
    }
    return {
      category: parsed.category,
      reason: parsed.reason,
      failsafe: false,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[whitelist-llm] failsafe error=transport msg=${message}`);
    return {
      category: "individual",
      reason: "failsafe:transport_error",
      failsafe: true,
      failsafeError: message,
      latencyMs,
      tokensIn: 0,
      tokensOut: 0,
    };
  }
}
