// Where an escalation sends the user first: the consultation form, marked
// so the contact page can explain what to write and pre-fill the subject.
// Staff read the form and point the user to an expert; the expert list on
// the card stays as reference, not as the first step.

export const ESCALATION_FORM_SOURCE = "escalation";

export function escalationFormPath(locale: "ja" | "en" | "tl"): string {
  return `/${locale}/contact?from=${ESCALATION_FORM_SOURCE}`;
}
