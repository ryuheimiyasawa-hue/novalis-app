// PII detection: refuses chat input that contains identifiers we never
// want flowing into Gemini, the conversation log, or the support team's
// inbox.
//
// Threat model: a user worried about their visa types literally their
// 在留カード番号 into the chat box. If we forward that to the LLM we
// risk (a) prompt-injection trampolines, (b) the LLM echoing the
// number back into the response, (c) the number persisting in
// `messages` indefinitely. Easier to refuse the message and ask the
// user to rephrase.
//
// Detection bias: we accept some false positives (the user is told to
// rephrase, no real harm). Patterns are tightened with word boundaries
// where possible to keep daily numbers (years, page counts) from
// firing.
//
// What we deliberately DO NOT detect here:
//   - Names / addresses (too noisy to be useful, would block normal
//     questions). Address-shaped strings inside a question are usually
//     fine; a residence card number isn't.
//   - Credit card numbers (rare in this domain). Add when a real
//     incident happens.
//   - Filipino phone numbers / IDs. Phase 2 once Filipino seed users
//     surface concrete patterns.
// See Lesson 12 in tasks/lessons.md for the dual-source-of-truth rule
// that informs why these patterns live in code, not the DB: they are
// behavioural, not catalogue data.

export type PiiType =
  | "zairyu_card"
  | "passport_jp"
  | "my_number"
  | "phone_jp"
  | "email";

export interface PiiHit {
  type: PiiType;
  /** Literal substring that matched. Useful for logs and audit, never echoed back to the user. */
  match: string;
}

const PATTERNS: Array<{ type: PiiType; re: RegExp }> = [
  // 在留カード番号: 2 letters + 8 digits + 2 letters = 12 chars total.
  // Word-boundary on both sides so an embedded code in a sentence still
  // matches but a longer alphanumeric (sha hash, etc.) does not.
  { type: "zairyu_card", re: /\b[A-Z]{2}\d{8}[A-Z]{2}\b/g },

  // Japanese passport: 1 uppercase letter + 8 digits (e.g. "TZ1234567"
  // is the older format; the current format is 2 letters + 7 digits =
  // 9 chars total). We accept both shapes.
  { type: "passport_jp", re: /\b[A-Z]{1,2}\d{7,8}\b/g },

  // マイナンバー: exactly 12 digits not bordered by other digits (so
  // "12345678901234" — 14 digits — won't match, but "1234 5678 9012"
  // also won't because of the spaces; that's fine, we'd rather miss
  // those than constantly false-positive on long numeric strings).
  { type: "my_number", re: /(?<!\d)\d{12}(?!\d)/g },

  // Japanese phone numbers, hyphenated and unhyphenated.
  // Hyphenated: 0X-XXXX-XXXX, 0XX-XXX-XXXX, 03-1234-5678, 090-1234-5678.
  // Unhyphenated: 10 or 11 digit string starting with 0.
  { type: "phone_jp", re: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g },
  { type: "phone_jp", re: /(?<!\d)0\d{9,10}(?!\d)/g },

  // Email — simplified RFC, sufficient for blocking purposes.
  { type: "email", re: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g },
];

export function detectPii(input: string): PiiHit[] {
  const hits: PiiHit[] = [];
  // Track substrings already counted so a string matching both a
  // tighter and a looser pattern (e.g. zairyu_card vs passport_jp's
  // generic [A-Z]{1,2}\d{7,8} prefix) only reports once.
  const seen = new Set<string>();

  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const key = `${type}:${m[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ type, match: m[0] });
    }
  }
  return hits;
}

export function summarisePiiHits(hits: PiiHit[]): { types: PiiType[]; count: number } {
  const set = new Set<PiiType>();
  for (const h of hits) set.add(h.type);
  return { types: Array.from(set), count: hits.length };
}
