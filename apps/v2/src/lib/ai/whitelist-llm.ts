import { z } from "zod";
import { generate } from "./gemini";
import type { WhitelistLocale } from "./whitelist-keywords";

// Stage 2 of the two-stage Whitelist (master plan §2-2): when the
// keyword pass let a message through, ask Gemini Flash itself whether
// the message is asking for individualised advice. The classifier is
// invoked in JSON mode so we get a structured response we can trust
// to parse.
//
// Fail-safe policy: anything that goes wrong here — Gemini error,
// timeout, malformed JSON, missing fields — collapses to "treat as
// individual" so the user is escalated to a human. The cost of an
// unnecessary escalation is a UX wrinkle; the cost of a missed
// escalation is the system answering personal legal questions.
// (Master plan §9 #1, #2.)

export const ClassifierResponseSchema = z.object({
  is_individual: z.boolean(),
  // Reason is bounded so a runaway LLM explanation cannot bloat logs
  // or `messages.whitelist_decision` JSONB.
  reason: z.string().min(1).max(500),
});

export type ClassifierParsed =
  | { ok: true; isIndividual: boolean; reason: string }
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
    isIndividual: parsed.data.is_individual,
    reason: parsed.data.reason,
  };
}

const SYSTEM_PROMPT = `You are a classifier for a foreigner-support chat in Japan.

Decide whether the user's question requires SPECIFIC, PERSONALIZED legal,
tax, immigration, or labour advice (i.e. an individual case), or whether
it is asking for GENERAL public information that any qualified
professional would answer the same way for everyone.

Lean toward classifying as INDIVIDUAL when the question is borderline.
A human expert can always confirm a question was actually general; the
opposite mistake (giving personal advice) creates real legal exposure.

Examples — INDIVIDUAL (return true):
  - "My visa expires next month, can I still apply for renewal?"
  - "My employer didn't pay overtime, can I sue?"
  - "I want to divorce my husband, what should I do?"
  - "在留期限が切れた人はどうなりますか？" (asker likely has this problem)
  - "Tinanggal ako sa trabaho kahapon" (personal incident)

Examples — GENERAL (return false):
  - "How long is a Working Visa valid in Japan?"
  - "What documents are required for renewing a Spouse Visa?"
  - "国民年金と厚生年金の違いは？"
  - "Anong dokumento ang kailangan para sa visa application?"

Reply with JSON only, no prose, matching this exact schema:
  {"is_individual": boolean, "reason": "<one short English sentence>"}`;

// JSON schema mirroring ClassifierResponseSchema. Gemini's structured
// output enforces this on the model side as a second line of defence
// in addition to our Zod parse.
const RESPONSE_SCHEMA = {
  type: "object",
  required: ["is_individual", "reason"],
  properties: {
    is_individual: { type: "boolean" },
    reason: { type: "string" },
  },
} as const;

export interface ClassifierResult {
  isIndividual: boolean;
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
 * Ask Gemini Flash to classify whether the message is asking for
 * individualised advice. On any error or malformed response, returns a
 * safe-default "isIndividual=true" result so the caller routes to
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
      maxOutputTokens: 200,
    });
    const parsed = parseClassifierResponse(result.text);
    if (!parsed.ok) {
      console.warn(
        `[whitelist-llm] failsafe error=${parsed.error} text=${result.text.slice(0, 200)}`,
      );
      return {
        isIndividual: true,
        reason: `failsafe:${parsed.error}`,
        failsafe: true,
        failsafeError: parsed.error,
        latencyMs: result.latencyMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      };
    }
    return {
      isIndividual: parsed.isIndividual,
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
      isIndividual: true,
      reason: "failsafe:transport_error",
      failsafe: true,
      failsafeError: message,
      latencyMs,
      tokensIn: 0,
      tokensOut: 0,
    };
  }
}
