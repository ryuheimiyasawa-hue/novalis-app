import type { ClassifierCategory } from "./whitelist-llm";

// Audit trail for the two-stage Whitelist routing decision (Phase 2 / P1-F).
//
// Before this, messages.whitelist_decision was always written as null
// (the route handler never passed it to persistResult), so there was no
// record of WHY the system answered, escalated, or treated a message as
// smalltalk. That trail is required to discharge the 弁護士法 / 行政書士法
// explainability obligation (master plan §9 #10) and to feed the monthly
// sampling review.
//
// This module is the single source of truth for the persisted shape. It is
// pure (no IO) so it unit-tests without mocking the pipeline.
//
// NOTE on escalationScore: it is a DETERMINISTIC interim signal (1.0 for any
// escalation trigger, 0.0 otherwise), not the graded 0.0-1.0 confidence the
// cumulative-scoring model (ESCALATION_USE_CUMULATIVE_SCORE, P2-L) ultimately
// wants. Emitting a graded score requires changing the heavily-tuned Stage2
// classifier prompt/output, which must be validated against live Gemini and is
// therefore deferred to P2-L. See docs/phase2-escalation-design.md §2.2.

export type DecisionStage =
  | "pii"
  | "too_long"
  | "empty"
  | "keyword"
  | "llm_individual"
  | "llm_general"
  | "llm_smalltalk"
  | "llm_failsafe"
  | "safety_block"
  | "generate_error";

export type DecisionOutcome = "answer" | "escalate" | "smalltalk" | "blocked";

export interface WhitelistDecision {
  /** Where in the pipeline the routing decision was made. */
  stage: DecisionStage;
  /** Terminal routing outcome the user experienced. */
  outcome: DecisionOutcome;
  /** Stage2 classifier category when it ran; null for pre-classifier stages
   *  (pii / too_long / empty / keyword). */
  category: ClassifierCategory | null;
  /** Short human-readable reason: classifier reason, matched keyword, or
   *  failsafe error. Already length-bounded upstream. */
  reason: string;
  /** Deterministic per-message escalation signal in [0,1] (interim — see
   *  module note). */
  escalationScore: number;
  /** True when the decision came from the safe-default failsafe path. */
  failsafe: boolean;
}

const ESCALATION_STAGES: ReadonlySet<DecisionStage> = new Set<DecisionStage>([
  "keyword",
  "llm_individual",
  "llm_failsafe",
  "safety_block",
  "generate_error",
]);

/**
 * Deterministic interim escalation signal: 1.0 when the stage is an
 * escalation trigger, else 0.0. Replaced by a graded LLM-emitted score in
 * P2-L when the cumulative model is built.
 */
export function deterministicEscalationScore(stage: DecisionStage): number {
  return ESCALATION_STAGES.has(stage) ? 1 : 0;
}

/**
 * Build the audit object persisted to messages.whitelist_decision. The
 * escalationScore is derived from the stage so callers cannot forget it or
 * set it inconsistently.
 */
export function buildDecision(args: {
  stage: DecisionStage;
  outcome: DecisionOutcome;
  category?: ClassifierCategory | null;
  reason: string;
  failsafe?: boolean;
}): WhitelistDecision {
  return {
    stage: args.stage,
    outcome: args.outcome,
    category: args.category ?? null,
    reason: args.reason,
    escalationScore: deterministicEscalationScore(args.stage),
    failsafe: args.failsafe ?? false,
  };
}
