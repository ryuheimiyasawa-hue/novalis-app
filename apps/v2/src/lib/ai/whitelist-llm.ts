import { z } from "zod";
import { generate, type HistoryTurn } from "./gemini";
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

═══════════════════════════════════════════════════════════════════════
ABSOLUTE OVERRIDES — these come BEFORE every other rule below.

The following surface signals, when they appear ALONE without other
concrete facts, NEVER make a message "individual". They MUST be
classified as "general":

  • Trouble words ALONE:
      "困った" "困っています" "悩み" "悩んでいる" "問題" "相談"
      "相談したい" "trouble" "problem" "concern" "worry" "issue"
  • Topic labels ALONE:
      "ビザ" "保険" "年金" "学校" "税金" "在留" "visa" "insurance"
      "tax" "pension" "school" — bare category names
  • Verb of consultation:
      "相談したい" "教えてほしい" "知りたい" "ask about" — these are
      how questions begin, not signals of escalation
  • First-person ALONE:
      "私は" "うちは" "I am" "my" — pronouns add nothing

Memorise these MANDATORY classifications:
  "最近困ったことがありまして"   → general  (trouble-word ALONE)
  "ビザの相談がしたいんです"      → general  (topic + verb ALONE)
  "保険のことで相談したいです"    → general  (topic + verb ALONE)
  "悩みがあって相談したいです"    → general  (trouble + verb ALONE)
  "私は最近困っています"         → general  (pronoun + trouble ALONE)
  "ビザのことで悩んでいます"      → general  (topic + trouble ALONE)
  "離婚を考えているんですが"      → general  (single thought, no facts)
  "問題があって"                 → general  (trouble-word ALONE)
  "相談したいことがあります"      → general  (consultation verb ALONE)

If the message is just one or more of the above patterns with NO other
concrete fact (specific status / date / party / deadline / document
state / amount), output "general". The downstream answerer will ask
ONE clarifying question and the conversation continues. That is the
desired UX. There is NO legal exposure from picking general here
because the answerer never gives personal advice.

═══════════════════════════════════════════════════════════════════════

Classify the user's message into exactly ONE of three categories.

"individual" — VERY NARROW. Pick this ONLY when the message satisfies
ALL of the following at the same time:
  (1) AT LEAST TWO concrete personal facts are stated, naming TWO OR
      MORE of:
      a specific status (e.g. 特定技能, 技人国, 永住, 留学),
      a specific date / period / amount,
      a specific other party (employer, spouse, landlord, agency)
      WITH a described action they took,
      a specific document or procedural state (e.g. 在留期限切れ,
      離婚調停中, 申請却下, 解雇通知).
  (2) A licensed professional's judgment (lawyer / 行政書士 / 税理士 /
      社労士 / immigration / family court) is genuinely required —
      generic public information could not responsibly resolve it.

If EITHER (1) or (2) is missing → NOT individual. Pick general.

═══════════════════════════════════════════════════════════════════════
"general" — DEFAULT. Any substantive message about life in Japan that
does not clearly satisfy BOTH (1) and (2) above. Includes:
  - public-information questions ("How long is a Working Visa valid?")
  - vague worries with no concrete facts ("最近困ったことがあって")
  - bare topic labels ("ビザの相談がしたい")
  - personal narratives without specifics ("私は最近悩んでいます")
  - early-stage life questions ("離婚を考えているんですが")
The downstream answerer will ask ONE clarifying question when the
input is too vague to answer. That is the desired UX. Erring toward
"general" is SAFE because the answerer never gives personal advice.

═══════════════════════════════════════════════════════════════════════
"smalltalk" — ONLY pure pleasantries with no substantive intent:
greetings, thanks, weather chit-chat, single-word filler, test strings.
A short worried message ("ちょっと悩みがあって") is general, not
smalltalk — it implies a question is coming.

═══════════════════════════════════════════════════════════════════════
WORKED EXAMPLES — STUDY THESE, they are the calibration target:

  Input:  "最近困ったことがありまして"
  Output: {"category":"general","reason":"vague worry, no concrete facts"}
  WHY:    No status, no date, no party, no document state. Topic word
          "困った" alone does NOT meet condition (1).

  Input:  "ビザの相談がしたいんです"
  Output: {"category":"general","reason":"bare topic label, no specifics"}
  WHY:    Just a category name. No specific visa, no situation, no
          deadline. Answerer will ask which visa and what aspect.

  Input:  "保険のことで相談したいです"
  Output: {"category":"general","reason":"bare topic label, no specifics"}
  WHY:    Same as above. "Consultation" verb does not equal individual.

  Input:  "私は最近悩んでいて、どうしたらいいでしょうか"
  Output: {"category":"general","reason":"abstract worry, no concrete facts"}
  WHY:    First-person + emotion is not enough. Needs facts.

  Input:  "離婚を考えているんですが"
  Output: {"category":"general","reason":"early-stage thought, no specifics"}
  WHY:    No spouse details, no children, no status, no timeline.

  Input:  "特定技能で働いていて、転職したいのですが今の会社が在留資格の手続きに協力してくれません"
  Output: {"category":"individual","reason":"specific status + specific party action requiring legal/immigration judgment"}
  WHY:    Status (特定技能) + other party (current employer) + specific
          obstructive action (在留資格手続き非協力) + needs legal
          judgment about employer obligation and worker recourse.

  Input:  "夫が3か月給料を払わず、もう離婚したいです"
  Output: {"category":"individual","reason":"concrete spousal facts requiring family-law judgment"}
  WHY:    Spouse + specific duration (3か月) + specific neglect
          (給料未払い) + explicit divorce intent.

  Input:  "在留期限が来月切れます、どうすればいいですか"
  Output: {"category":"individual","reason":"concrete deadline + status requiring immigration judgment"}
  WHY:    Specific deadline + own status. (Stage1 keyword catches
          this; classifier may not see it, but be consistent if asked.)

  Input:  "在留資格の更新には何が必要ですか？"
  Output: {"category":"general","reason":"general procedural information, no personal facts"}
  WHY:    Public info question. Anyone gets the same answer.

  Input:  "国民年金と厚生年金の違いは？"
  Output: {"category":"general","reason":"public information about systems"}

  Input:  "こんにちは"
  Output: {"category":"smalltalk","reason":"greeting only"}

  Input:  "ああ"
  Output: {"category":"smalltalk","reason":"acknowledgement filler"}

═══════════════════════════════════════════════════════════════════════
TIE-BREAKER — when uncertain between individual and general:
  → ALWAYS pick "general". The downstream answerer asks back, gets
    the missing facts, and on the NEXT turn the classifier can
    re-evaluate with full information. Forcing escalate on a vague
    first turn ends the conversation badly.
  Only pick "individual" when conditions (1) AND (2) are clearly,
  obviously satisfied on this single message.

═══════════════════════════════════════════════════════════════════════
Reply with JSON only, no prose, matching this exact schema:
  {"category":"individual"|"general"|"smalltalk","reason":"<one short English sentence>"}`;

// Module-load fingerprint. Lets us confirm via dev logs that the
// running process actually picked up the latest prompt revision,
// not a stale .next cache. The OVERRIDES_HEAD substring is a chunk
// of the new prompt's distinctive opening — if you don't see this
// exact phrase in the log, the dev server is serving a cached copy
// and a `pnpm dev:clean` is required.
const SYSTEM_PROMPT_FINGERPRINT = `len=${SYSTEM_PROMPT.length} lines=${SYSTEM_PROMPT.split("\n").length}`;
const OVERRIDES_HEAD_PRESENT = SYSTEM_PROMPT.includes("ABSOLUTE OVERRIDES");
console.log(
  `[whitelist-llm] system prompt loaded: ${SYSTEM_PROMPT_FINGERPRINT} overrides=${OVERRIDES_HEAD_PRESENT}`,
);

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
  _locale: WhitelistLocale,
  history?: HistoryTurn[],
): Promise<ClassifierResult> {
  const start = Date.now();
  // Diagnostic: log the input + history depth + which prompt revision
  // is being used. Pair this with the per-request "raw response" +
  // "parsed" logs below so dev-time mis-classifications can be traced
  // end-to-end without adding any client-visible state. Keep messages
  // truncated so PII-bearing inputs (already gated upstream, but
  // defence in depth) don't get spilled into logs at full length.
  console.log(
    `[whitelist-llm] classify start: msg='${message.slice(0, 120).replace(/\n/g, " ")}' history=${history?.length ?? 0} promptFp=${SYSTEM_PROMPT_FINGERPRINT}`,
  );
  try {
    const result = await generate(message, {
      systemInstruction: SYSTEM_PROMPT,
      history,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Allow a small amount of thinking. With thinkingBudget=0 the
      // model pattern-matches surface words ("困った"→trouble→personal
      // → individual) and ignores the prompt's two-of-N facts rule —
      // observed in dev on 2026-05-14 / 15 after few-shot expansion
      // failed to fix it. 256 tokens is enough to mentally check the
      // (1) AND (2) gate without bloating latency. We bump
      // maxOutputTokens accordingly so thinking + JSON output both
      // fit (Gemini 2.5 caps the combined total).
      thinkingBudget: 256,
      maxOutputTokens: 1500,
    });
    // Diagnostic: log raw response BEFORE parsing so a malformed
    // payload is visible even when parseClassifierResponse rejects.
    console.log(
      `[whitelist-llm] classify raw: latency=${result.latencyMs}ms tokens=${result.tokensIn}/${result.tokensOut} text='${result.text.slice(0, 240).replace(/\n/g, " ")}'`,
    );
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
    console.log(
      `[whitelist-llm] classify parsed: category=${parsed.category} reason='${parsed.reason}'`,
    );
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
