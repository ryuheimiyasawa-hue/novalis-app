import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";

const ConsentSchema = z.object({
  terms_version: z.string().min(1),
  privacy_version: z.string().min(1),
  age_verified: z.literal(true),
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

  let body: z.infer<typeof ConsentSchema>;
  try {
    body = ConsentSchema.parse(await req.json());
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
    console.error("[consent] insert failed:", insertError.message);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  // Set onboarded_at only if currently NULL; always set age_verified.
  const { data: profile, error: fetchError } = await admin
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (fetchError) {
    console.error("[consent] profile fetch failed:", fetchError.message);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  const updates: { age_verified: true; onboarded_at?: string } = {
    age_verified: true,
  };
  if (!profile?.onboarded_at) updates.onboarded_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (updateError) {
    console.error("[consent] profile update failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
