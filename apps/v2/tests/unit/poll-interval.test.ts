import { describe, expect, it } from "vitest";
import {
  POLL_BACKOFF_MAX_MS,
  POLL_INTERVAL_AUTO_MS,
  POLL_INTERVAL_OPERATOR_MS,
  POLL_MAX_FAILURES,
  isTerminalPollStatus,
  nextPollDelayMs,
} from "@/lib/chat/poll-interval";

// P2-B2. The chat client polls for operator replies; this is the cadence
// logic split out so the timing rules are asserted without a timer.

describe("nextPollDelayMs", () => {
  it("polls slowly while the AI is answering", () => {
    expect(nextPollDelayMs({ mode: "auto", consecutiveFailures: 0 })).toBe(
      POLL_INTERVAL_AUTO_MS,
    );
  });

  it("tightens once staff are on the line", () => {
    expect(nextPollDelayMs({ mode: "operator", consecutiveFailures: 0 })).toBe(
      POLL_INTERVAL_OPERATOR_MS,
    );
  });

  it("backs off exponentially on failures", () => {
    expect(nextPollDelayMs({ mode: "operator", consecutiveFailures: 1 })).toBe(
      POLL_INTERVAL_OPERATOR_MS * 2,
    );
    expect(nextPollDelayMs({ mode: "operator", consecutiveFailures: 2 })).toBe(
      POLL_INTERVAL_OPERATOR_MS * 4,
    );
  });

  it("never waits longer than the cap", () => {
    const d = nextPollDelayMs({ mode: "auto", consecutiveFailures: 4 });
    expect(d).toBe(POLL_BACKOFF_MAX_MS);
  });

  it("gives up after the failure ceiling instead of retrying forever", () => {
    expect(
      nextPollDelayMs({ mode: "operator", consecutiveFailures: POLL_MAX_FAILURES }),
    ).toBeNull();
    expect(
      nextPollDelayMs({ mode: "auto", consecutiveFailures: POLL_MAX_FAILURES + 3 }),
    ).toBeNull();
  });

  it("treats a negative failure count as healthy", () => {
    expect(nextPollDelayMs({ mode: "auto", consecutiveFailures: -1 })).toBe(
      POLL_INTERVAL_AUTO_MS,
    );
  });
});

describe("isTerminalPollStatus", () => {
  it("stops on auth and ownership failures", () => {
    expect(isTerminalPollStatus(401)).toBe(true);
    expect(isTerminalPollStatus(403)).toBe(true);
    expect(isTerminalPollStatus(404)).toBe(true);
  });

  it("keeps retrying transient server errors", () => {
    expect(isTerminalPollStatus(500)).toBe(false);
    expect(isTerminalPollStatus(502)).toBe(false);
    expect(isTerminalPollStatus(200)).toBe(false);
  });
});
