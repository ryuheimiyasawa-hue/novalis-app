import { detectPii } from "@/lib/pii/detect";

// PII scrubbing for Sentry events (Phase 2 / P1-D).
//
// Chat messages, escalation bodies, and error context can contain residence
// card numbers, My Number, phone numbers, and emails. Sentry must never store
// them. This runs in every Sentry `beforeSend` (server / edge / browser) and
// redacts every PII match found in any string anywhere in the event.
//
// Pure (no IO, no Sentry imports) so it unit-tests in isolation. detectPii is
// itself dependency-free, so importing this into the browser bundle is safe.

// Bound the walk so a deeply nested or pathological event can't blow the stack.
const MAX_DEPTH = 8;

/**
 * Replace every PII occurrence in a string with a typed placeholder, e.g.
 * "AB12345678CD" -> "[REDACTED_zairyu_card]". Returns the input unchanged when
 * no PII is present (the common case, so this stays cheap).
 */
export function redactPii(text: string): string {
  const hits = detectPii(text);
  if (hits.length === 0) return text;
  let out = text;
  for (const h of hits) {
    // split/join replaces every occurrence without regex re-escaping.
    out = out.split(h.match).join(`[REDACTED_${h.type}]`);
  }
  return out;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactPii(value);
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Recursively redact PII from every string in a Sentry event. The event is a
 * plain serialisable object by the time `beforeSend` runs, so rebuilding it as
 * plain objects is safe. Returns the same reference type for a clean
 * `beforeSend: (event) => scrubEvent(event)` call site.
 */
export function scrubEvent<T>(event: T): T {
  return scrubValue(event, 0) as T;
}
