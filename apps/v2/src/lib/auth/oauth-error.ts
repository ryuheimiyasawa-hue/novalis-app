// Which login error to show when Facebook (through Supabase) sends the user
// back with `error` instead of `code`.
//
// Every provider error used to read "Facebook login was cancelled". A real
// user whose Facebook account has no email address (common for accounts
// created with a phone number) was told they had cancelled, when Supabase
// had in fact refused the account: "Error getting user email from external
// provider". Only an actual refusal on the Facebook screen is a cancel.

export type OAuthErrorCode = "fb_denied" | "fb_no_email" | "fb_failed";

export function classifyOAuthError(
  error: string,
  description: string | null,
): OAuthErrorCode {
  if (error === "access_denied") return "fb_denied";
  if (description && /email/i.test(description)) return "fb_no_email";
  return "fb_failed";
}
