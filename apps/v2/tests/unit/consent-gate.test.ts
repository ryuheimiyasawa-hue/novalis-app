import { describe, expect, it, vi } from "vitest";
import { checkConsent, gateDecision, isConsentCurrent } from "@/lib/legal/consent";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

// One definition of "agreed to the documents in force", used by the proxy,
// /api/chat/send, the Messenger webhook and /api/consent/me.

const current = { terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION };

describe("isConsentCurrent", () => {
  it("is true only when both documents match the version in force", () => {
    expect(isConsentCurrent(current)).toBe(true);
    expect(isConsentCurrent({ ...current, terms_version: "0.0.1" })).toBe(false);
    expect(isConsentCurrent({ ...current, privacy_version: "0.0.1" })).toBe(false);
  });

  it("treats no consent at all as not current", () => {
    expect(isConsentCurrent(null)).toBe(false);
    expect(isConsentCurrent(undefined)).toBe(false);
    expect(isConsentCurrent({ terms_version: null, privacy_version: null })).toBe(false);
  });
});

describe("gateDecision", () => {
  it("sends users with no profile row to onboarding", () => {
    expect(gateDecision(undefined)).toBe("onboarding");
  });

  it("sends not-onboarded users to onboarding even if a consent row exists", () => {
    expect(gateDecision({ onboarded: false, ...current })).toBe("onboarding");
  });

  it("sends onboarded users with stale or missing consent to /consent", () => {
    // Measured 2026-09-13: one permanent user is onboarded with no consent log.
    expect(gateDecision({ onboarded: true, terms_version: null, privacy_version: null })).toBe(
      "consent",
    );
    expect(gateDecision({ onboarded: true, ...current, terms_version: "0.0.1" })).toBe("consent");
  });

  it("passes onboarded users whose consent is current", () => {
    expect(gateDecision({ onboarded: true, ...current })).toBe("pass");
  });
});

describe("checkConsent", () => {
  function admin(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(async () => result);
    return { from: vi.fn(() => chain), chain } as const;
  }

  it("reads the latest row for that user", async () => {
    const a = admin({ data: [current], error: null });
    await expect(checkConsent(a as never, "u1")).resolves.toBe("current");
    expect(a.from).toHaveBeenCalledWith("consent_logs");
    expect(a.chain.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(a.chain.order).toHaveBeenCalledWith("consented_at", { ascending: false });
    expect(a.chain.limit).toHaveBeenCalledWith(1);
  });

  it("is stale with no rows or an old version", async () => {
    await expect(checkConsent(admin({ data: [], error: null }) as never, "u1")).resolves.toBe("stale");
    await expect(
      checkConsent(admin({ data: [{ ...current, terms_version: "0.0.1" }], error: null }) as never, "u1"),
    ).resolves.toBe("stale");
  });

  it("reports error instead of guessing when the query fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      checkConsent(admin({ data: null, error: { message: "timeout" } }) as never, "u1"),
    ).resolves.toBe("error");
    spy.mockRestore();
  });
});
