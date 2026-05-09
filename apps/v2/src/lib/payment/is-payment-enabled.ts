// Single-purpose flag check. Callers compose their own conditional logic
// (e.g. `if (isPaymentEnabled()) { ...paywall... }`) so this stays trivial
// and side-effect free. See tasks/W2-design.md §6-5.
export function isPaymentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENT_ENABLED === "true";
}
