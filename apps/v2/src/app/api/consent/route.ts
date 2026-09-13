import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ConsentFieldsSchema, isConsentCurrent } from "@/lib/legal/consent";

// Re-consent after a terms / privacy revision (lawyer review 2-6), and the
// consent step for anyone already onboarded but missing a current log.
// First-time users consent through /api/onboarding instead, which also
// collects the profile fields; this route never marks a user onboarded.
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

  let body: z.infer<typeof ConsentFieldsSchema>;
  try {
    body = ConsentFieldsSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  // A form left open across a version bump would otherwise record consent to
  // the old documents, and the gate would send the user straight back here.
  if (!isConsentCurrent(body)) {
    return NextResponse.json(
      { ok: false, error: "VERSION_MISMATCH" },
      { status: 409 },
    );
  }

  const { error } = await getAdminClient().rpc("record_consent", {
    p_user_id: user.id,
    p_terms_version: body.terms_version,
    p_privacy_version: body.privacy_version,
    p_terms_opened: body.terms_opened,
    p_privacy_opened: body.privacy_opened,
    p_mark_onboarded: false,
  });
  if (error) {
    console.error(
      JSON.stringify({ event: "consent_record_failed", route: "consent", user_id: user.id, message: error.message }),
    );
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
