// Escalation display policy (Phase 2 / P2-L improvement 2).
//
// When an escalation fires repeatedly within a short window, re-showing the
// full EscalationCard every time feels naggy. With the continue-button feature
// enabled, the second-and-later escalations inside the cooldown window collapse
// to a compact inline note instead of the full card. Pure + unit-tested; the
// ChatShell owns the turn bookkeeping and calls this to decide what to render.

/** Number of user turns after a full card during which further escalations
 *  render compact instead of re-showing the whole card. */
export const ESCALATION_COOLDOWN_TURNS = 3;

/**
 * Decide whether an escalation should render as the FULL EscalationCard
 * (true) or a compact note (false).
 *
 * - cooldownEnabled is the NEXT_PUBLIC_ESCALATION_SHOW_CONTINUE_BUTTON flag.
 *   When OFF, behaviour is unchanged from Phase 1: always the full card.
 * - turnsSinceLastCard is the count of user turns since the last full card,
 *   or null when no card has been shown in this conversation yet (the first
 *   escalation always gets the full card).
 */
export function shouldShowEscalationCard(opts: {
  cooldownEnabled: boolean;
  turnsSinceLastCard: number | null;
}): boolean {
  if (!opts.cooldownEnabled) return true;
  if (opts.turnsSinceLastCard === null) return true;
  return opts.turnsSinceLastCard > ESCALATION_COOLDOWN_TURNS;
}
