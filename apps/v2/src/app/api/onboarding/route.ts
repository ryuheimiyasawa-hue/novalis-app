import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { PREFECTURE_CODE_RE } from "@/lib/i18n/prefectures";
import { ConsentFieldsSchema, isConsentCurrent } from "@/lib/legal/consent";

// Single-shot onboarding endpoint: records consent and applies all profile
// fields collected during the onboarding flow in one request.
// /api/consent handles re-consent after a terms revision.
const OnboardingSchema = ConsentFieldsSchema.extend({
  preferred_language: z.enum(["ja", "en", "tl"]),
  prefecture_code: z.string().regex(PREFECTURE_CODE_RE),
  city_name: z.string().max(100).optional().default(""),
});

export async function POST(req: NextRequest) {
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

  let body: z.infer<typeof OnboardingSchema>;
  try {
    body = OnboardingSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  if (!isConsentCurrent(body)) {
    return NextResponse.json(
      { ok: false, error: "VERSION_MISMATCH" },
      { status: 409 },
    );
  }

  const admin = getAdminClient();

  // Profile fields first, onboarded_at last. record_consent stamps
  // onboarded_at in the same transaction as the consent log, so a failure
  // anywhere leaves the user not-onboarded and the proxy sends them back to
  // this form; nobody ends up onboarded without a prefecture or a log.
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      preferred_language: body.preferred_language,
      prefecture_code: body.prefecture_code,
      city_name: body.city_name,
    })
    .eq("id", user.id);
  if (updateError) {
    console.error(
      JSON.stringify({ event: "onboarding_profile_update_failed", user_id: user.id, message: updateError.message }),
    );
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  const { error: consentError } = await admin.rpc("record_consent", {
    p_user_id: user.id,
    p_terms_version: body.terms_version,
    p_privacy_version: body.privacy_version,
    p_terms_opened: body.terms_opened,
    p_privacy_opened: body.privacy_opened,
    p_mark_onboarded: true,
  });
  if (consentError) {
    console.error(
      JSON.stringify({ event: "consent_record_failed", route: "onboarding", user_id: user.id, message: consentError.message }),
    );
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
