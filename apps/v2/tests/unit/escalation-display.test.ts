import { describe, expect, it } from "vitest";
import {
  ESCALATION_COOLDOWN_TURNS,
  shouldShowEscalationCard,
} from "@/lib/chat/escalation-display";

describe("shouldShowEscalationCard", () => {
  it("always shows the full card when the cooldown feature is off (Phase 1 behaviour)", () => {
    expect(
      shouldShowEscalationCard({ cooldownEnabled: false, turnsSinceLastCard: 0 }),
    ).toBe(true);
    expect(
      shouldShowEscalationCard({
        cooldownEnabled: false,
        turnsSinceLastCard: null,
      }),
    ).toBe(true);
  });

  it("shows the full card for the first escalation (no prior card)", () => {
    expect(
      shouldShowEscalationCard({
        cooldownEnabled: true,
        turnsSinceLastCard: null,
      }),
    ).toBe(true);
  });

  it("renders compact within the cooldown window", () => {
    for (let t = 0; t <= ESCALATION_COOLDOWN_TURNS; t++) {
      expect(
        shouldShowEscalationCard({
          cooldownEnabled: true,
          turnsSinceLastCard: t,
        }),
      ).toBe(false);
    }
  });

  it("shows the full card again once the cooldown window has passed", () => {
    expect(
      shouldShowEscalationCard({
        cooldownEnabled: true,
        turnsSinceLastCard: ESCALATION_COOLDOWN_TURNS + 1,
      }),
    ).toBe(true);
  });
});
