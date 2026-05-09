import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from "@/lib/legal/versions";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { ok: false, error: e.code },
        { status: e.status },
      );
    }
    throw e;
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("consent_logs")
    .select("terms_version, privacy_version, consented_at")
    .eq("user_id", user.id)
    .order("consented_at", { ascending: false })
    .limit(1);

  const latest = rows?.[0] ?? null;
  const consentedTermsVersion = latest?.terms_version ?? null;
  const consentedPrivacyVersion = latest?.privacy_version ?? null;
  const isLatest =
    consentedTermsVersion === CURRENT_TERMS_VERSION &&
    consentedPrivacyVersion === CURRENT_PRIVACY_VERSION;

  return NextResponse.json({
    latestTermsVersion: CURRENT_TERMS_VERSION,
    latestPrivacyVersion: CURRENT_PRIVACY_VERSION,
    consentedTermsVersion,
    consentedPrivacyVersion,
    isLatest,
    consentedAt: latest?.consented_at ?? null,
  });
}
