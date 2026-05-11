import { describe, expect, it } from "vitest";
import { evaluateQuota, periodYyyymm } from "@/lib/chat/trial-quota";

// Fixed "now" so every test computes deterministically against
// 2026-05-11 10:00:00 JST (== 2026-05-11 01:00:00 UTC).
const NOW = new Date("2026-05-11T01:00:00.000Z");

describe("evaluateQuota", () => {
  it("allows everyone when payment is disabled (MVP default)", () => {
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: false,
      trialEndsAt: null,
      activeSubscription: null,
      currentUsageCount: 999,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("payment_disabled");
  });

  it("allows during Welcome Trial when trial_ends_at is in the future", () => {
    const trialEnd = new Date("2026-05-25T00:00:00.000Z");
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: trialEnd,
      activeSubscription: null,
      currentUsageCount: 100, // ignored during trial
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("trial");
  });

  it("does not consider expired Welcome Trial", () => {
    const trialEnd = new Date("2026-05-01T00:00:00.000Z"); // past
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: trialEnd,
      activeSubscription: null,
      currentUsageCount: 0,
    });
    expect(r.reason).not.toBe("trial");
  });

  it("allows when active subscription is current", () => {
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: null,
      activeSubscription: {
        status: "active",
        endsAt: new Date("2026-12-31T00:00:00.000Z"),
      },
      currentUsageCount: 100, // ignored for paid users
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("subscription");
  });

  it("does not honour a subscription with status != 'active'", () => {
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: null,
      activeSubscription: {
        status: "expired",
        endsAt: new Date("2026-12-31T00:00:00.000Z"),
      },
      currentUsageCount: 0,
    });
    // Falls through to free quota
    expect(r.reason).toBe("free_quota");
  });

  it("does not honour an active subscription whose ends_at is past", () => {
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: null,
      activeSubscription: {
        status: "active",
        endsAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      currentUsageCount: 0,
    });
    expect(r.reason).toBe("free_quota");
  });

  it("allows free-tier messages until the monthly cap", () => {
    for (let count = 0; count < 3; count++) {
      const r = evaluateQuota({
        now: NOW,
        paymentEnabled: true,
        trialEndsAt: null,
        activeSubscription: null,
        currentUsageCount: count,
      });
      expect(r.allowed).toBe(true);
      expect(r.reason).toBe("free_quota");
      expect(r.remaining).toBe(2 - count);
    }
  });

  it("blocks when the free quota is exhausted", () => {
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: null,
      activeSubscription: null,
      currentUsageCount: 3,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("quota_exceeded");
    expect(r.remaining).toBe(0);
  });

  it("respects a custom freeQuotaPerMonth override", () => {
    const r = evaluateQuota({
      now: NOW,
      paymentEnabled: true,
      trialEndsAt: null,
      activeSubscription: null,
      currentUsageCount: 4,
      freeQuotaPerMonth: 5,
    });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });
});

describe("periodYyyymm", () => {
  it("returns the JST month for a given UTC instant", () => {
    // 2026-05-11 01:00 UTC == 2026-05-11 10:00 JST
    expect(periodYyyymm(NOW)).toBe("2026-05");
  });

  it("rolls over at JST midnight, not UTC midnight", () => {
    // 2026-05-31 16:30 UTC == 2026-06-01 01:30 JST -> period must be June
    const lateMay = new Date("2026-05-31T16:30:00.000Z");
    expect(periodYyyymm(lateMay)).toBe("2026-06");
  });

  it("does not roll over yet at 14:00 UTC on the last day", () => {
    // 2026-05-31 14:00 UTC == 2026-05-31 23:00 JST -> still May
    const earlyEveningJst = new Date("2026-05-31T14:00:00.000Z");
    expect(periodYyyymm(earlyEveningJst)).toBe("2026-05");
  });

  it("pads single-digit months", () => {
    const jan = new Date("2026-01-15T00:00:00.000Z");
    expect(periodYyyymm(jan)).toBe("2026-01");
  });

  it("supports overriding the timezone", () => {
    // 2026-05-11 23:00 UTC in Asia/Manila (+08:00) == 2026-05-12 07:00 PHT
    const r = periodYyyymm(new Date("2026-05-11T23:00:00.000Z"), "Asia/Manila");
    expect(r).toBe("2026-05");
  });
});
