import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "./versions";

// One definition of "this user has agreed to the documents in force".
// The proxy (UI redirect), /api/chat/send and the Messenger webhook (both
// hard gates in front of Gemini) and /api/consent/me all ask this question;
// if any of them answered it differently, the one that answered "yes" would
// be the hole. See tasks/consent-1.1-design.md §11.

export interface ConsentedVersions {
  terms_version: string | null;
  privacy_version: string | null;
}

export function isConsentCurrent(latest: ConsentedVersions | null | undefined): boolean {
  return (
    !!latest &&
    latest.terms_version === CURRENT_TERMS_VERSION &&
    latest.privacy_version === CURRENT_PRIVACY_VERSION
  );
}

// Where the proxy sends an authenticated page load. Onboarding comes first:
// it records consent itself, so a not-yet-onboarded user is never asked twice.
export function gateDecision(
  state: (ConsentedVersions & { onboarded: boolean }) | null | undefined,
): "pass" | "onboarding" | "consent" {
  if (!state?.onboarded) return "onboarding";
  return isConsentCurrent(state) ? "pass" : "consent";
}

// Shared body for /api/consent and the consent half of /api/onboarding.
// Versions are validated as plain strings here so that a stale tab can be
// told 409 (reload) rather than 400 (you sent garbage).
export const ConsentFieldsSchema = z.object({
  terms_version: z.string().min(1).max(20),
  privacy_version: z.string().min(1).max(20),
  age_verified: z.literal(true),
  terms_opened: z.boolean().optional().default(false),
  privacy_opened: z.boolean().optional().default(false),
});

export type ConsentCheck = "current" | "stale" | "error";

/**
 * Server-side check for the hard gates. Returns "error" instead of throwing
 * so each caller decides explicitly what an outage means — for anything
 * that sends user text abroad the answer is "do not send" (fail closed).
 */
export async function checkConsent(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<ConsentCheck> {
  const { data, error } = await admin
    .from("consent_logs")
    .select("terms_version, privacy_version")
    .eq("user_id", userId)
    .order("consented_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(
      JSON.stringify({ event: "consent_check_failed", user_id: userId, message: error.message }),
    );
    return "error";
  }
  return isConsentCurrent(data?.[0]) ? "current" : "stale";
}
