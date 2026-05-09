import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { PREFECTURE_CODE_RE } from "@/lib/i18n/prefectures";

// Single-shot onboarding endpoint: records consent and applies all profile
// fields collected during the onboarding flow in one request.
// /api/consent remains for the future "re-consent on terms revision" flow.
const OnboardingSchema = z.object({
  terms_version: z.string().min(1),
  privacy_version: z.string().min(1),
  age_verified: z.literal(true),
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

  const admin = getAdminClient();

  const { error: insertError } = await admin.from("consent_logs").insert({
    user_id: user.id,
    terms_version: body.terms_version,
    privacy_version: body.privacy_version,
    age_verified: body.age_verified,
  });
  if (insertError) {
    console.error("[onboarding] consent_logs insert failed:", insertError.message);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  // Set onboarded_at only if currently NULL; always overwrite the rest.
  const { data: profile, error: fetchError } = await admin
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (fetchError) {
    console.error("[onboarding] profile fetch failed:", fetchError.message);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  const updates: {
    age_verified: true;
    preferred_language: "ja" | "en" | "tl";
    prefecture_code: string;
    city_name: string;
    onboarded_at?: string;
  } = {
    age_verified: true,
    preferred_language: body.preferred_language,
    prefecture_code: body.prefecture_code,
    city_name: body.city_name,
  };
  if (!profile?.onboarded_at) updates.onboarded_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (updateError) {
    console.error("[onboarding] profile update failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
