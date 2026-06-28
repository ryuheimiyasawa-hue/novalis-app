import { describe, expect, it } from "vitest";
import {
  buildDecision,
  deterministicEscalationScore,
  type DecisionStage,
} from "@/lib/ai/whitelist-decision";

describe("deterministicEscalationScore", () => {
  const escalationStages: DecisionStage[] = [
    "keyword",
    "llm_individual",
    "llm_failsafe",
    "safety_block",
    "generate_error",
  ];
  const nonEscalationStages: DecisionStage[] = [
    "pii",
    "too_long",
    "empty",
    "llm_general",
    "llm_smalltalk",
  ];

  it.each(escalationStages)("scores 1.0 for escalation stage %s", (stage) => {
    expect(deterministicEscalationScore(stage)).toBe(1);
  });

  it.each(nonEscalationStages)(
    "scores 0.0 for non-escalation stage %s",
    (stage) => {
      expect(deterministicEscalationScore(stage)).toBe(0);
    },
  );
});

describe("buildDecision", () => {
  it("derives escalationScore from the stage, not a passed value", () => {
    const d = buildDecision({
      stage: "keyword",
      outcome: "escalate",
      reason: "kw:在留期限",
    });
    expect(d.escalationScore).toBe(1);
    expect(d.stage).toBe("keyword");
    expect(d.outcome).toBe("escalate");
    expect(d.reason).toBe("kw:在留期限");
  });

  it("defaults category to null and failsafe to false", () => {
    const d = buildDecision({
      stage: "pii",
      outcome: "blocked",
      reason: "pii:email",
    });
    expect(d.category).toBeNull();
    expect(d.failsafe).toBe(false);
    expect(d.escalationScore).toBe(0);
  });

  it("preserves an explicit category and failsafe flag", () => {
    const d = buildDecision({
      stage: "llm_failsafe",
      outcome: "escalate",
      category: "individual",
      reason: "failsafe:invalid_json",
      failsafe: true,
    });
    expect(d.category).toBe("individual");
    expect(d.failsafe).toBe(true);
    expect(d.escalationScore).toBe(1);
  });

  it("records a general answer with a 0 escalation signal", () => {
    const d = buildDecision({
      stage: "llm_general",
      outcome: "answer",
      category: "general",
      reason: "public information question",
    });
    expect(d.outcome).toBe("answer");
    expect(d.category).toBe("general");
    expect(d.escalationScore).toBe(0);
  });

  it("produces a JSON-serialisable object (persisted to JSONB)", () => {
    const d = buildDecision({
      stage: "llm_smalltalk",
      outcome: "smalltalk",
      category: "smalltalk",
      reason: "greeting only",
    });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});
