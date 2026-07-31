import { randomInt } from "node:crypto";

// Self-serve Messenger account linking (P2-K follow-up).
//
// The user asks the web app for a short code, sends it to the bot, and the
// webhook exchanges it for a messenger_links row. These helpers are pure so
// the alphabet, shape and normalisation rules can be unit-tested without a DB.

// Ambiguity-free alphabet: no I/O (look like 1/0) and no 0/1 themselves, so a
// code read off a screen and retyped on a phone keyboard is unambiguous.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Cryptographically random code. randomInt is unbiased over the alphabet. */
export function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Normalise what a person actually typed into Messenger: uppercase, and drop
 * whitespace, separators and anything outside A-Z0-9. People commonly send the
 * code lowercase, with a hyphen, or wrapped in quotes.
 *
 * Excluded glyphs (I/O/0/1) are deliberately NOT folded onto alphabet members:
 * a code containing them fails to match cleanly rather than binding a
 * different user's code.
 */
export function normalizeLinkCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** True when the text could be a link code (used to branch in the webhook). */
export function isLinkCodeShape(input: string): boolean {
  return CODE_RE.test(input);
}

/** Expiry timestamp for a freshly issued code. */
export function linkCodeExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);
}
