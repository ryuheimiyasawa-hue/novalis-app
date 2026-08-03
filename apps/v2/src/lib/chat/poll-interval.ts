// P2-B2. Polling cadence for the chat client.
//
// We poll instead of using Supabase Realtime because realtime would mean
// designing channel-level authorization on top of RLS, and a 5s delay is
// imperceptible in a human-to-human exchange (design §10-a).
//
// The cadence is deliberately asymmetric: an `auto` conversation only
// polls to notice that staff took over, which is rare, so 30s is plenty.
// Once staff IS on the line, replies should land fast, so we tighten to
// 5s. Combined with "stop polling when the tab is hidden", 20 beta users
// cost at most a few hundred requests per minute (design §8).

export const POLL_INTERVAL_AUTO_MS = 30_000;
export const POLL_INTERVAL_OPERATOR_MS = 5_000;
export const POLL_BACKOFF_MAX_MS = 60_000;
export const POLL_MAX_FAILURES = 5;

export type PollMode = "auto" | "operator";

/**
 * Delay before the next poll, or `null` to stop polling entirely.
 *
 * Failures back off exponentially from the mode's base interval so a
 * flapping network or a 5xx doesn't hammer the endpoint. After
 * POLL_MAX_FAILURES consecutive failures we give up and let the UI tell
 * the user to reload — an endless silent retry loop is worse than an
 * honest error, because the user would keep waiting for a reply that
 * will never arrive.
 */
export function nextPollDelayMs(args: {
  mode: PollMode;
  consecutiveFailures: number;
}): number | null {
  const { mode, consecutiveFailures } = args;
  if (consecutiveFailures >= POLL_MAX_FAILURES) return null;

  const base =
    mode === "operator" ? POLL_INTERVAL_OPERATOR_MS : POLL_INTERVAL_AUTO_MS;
  if (consecutiveFailures <= 0) return base;

  return Math.min(base * 2 ** consecutiveFailures, POLL_BACKOFF_MAX_MS);
}

/**
 * 401/403 are terminal: the session expired or the conversation isn't
 * ours. Retrying cannot fix either, and hammering an endpoint that just
 * said "no" is how you get rate-limited. Stop and surface it instead.
 */
export function isTerminalPollStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}
