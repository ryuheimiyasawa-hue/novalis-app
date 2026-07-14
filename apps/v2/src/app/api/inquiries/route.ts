import { type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/response";
import { InquiryCreateSchema } from "@/lib/inquiries/schema";

// First-party contact / support inbox (P2-M, Feature A).
//
// The insert deliberately goes through the *user-scoped* client (not the
// service role) so the RLS policy `inquiries_self_insert` enforces both
// ownership (auth.uid() = user_id) and the anon-block that migrations
// 007/008 added to keep anonymous beta testers from spamming the inbox.
// We also check is_anonymous up-front to return a clear error instead of
// leaning on an opaque RLS rejection.
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  if (user.is_anonymous === true) {
    // Anonymous testers reach support via the email fallback shown on
    // the contact page; they cannot write to the inbox.
    return fail("FORBIDDEN", "anonymous users cannot submit inquiries");
  }

  let body: ReturnType<typeof InquiryCreateSchema.parse>;
  try {
    body = InquiryCreateSchema.parse(await req.json());
  } catch {
    return fail("INVALID_INPUT");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      user_id: user.id,
      subject: body.subject,
      message: body.message,
      contact_email: body.contact_email,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[inquiries] insert failed:", error.message);
    return fail("INTERNAL_ERROR");
  }

  return ok({ id: data.id }, { status: 201 });
}
