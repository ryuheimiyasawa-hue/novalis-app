import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { InquiryUpdateSchema } from "@/lib/inquiries/schema";

const UuidSchema = z.string().uuid();

// Admin inbox status transition (pending -> contacted -> resolved / closed).
// Reads happen in the server components; this route only mutates status.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await ctx.params;
  if (!UuidSchema.safeParse(id).success) return fail("NOT_FOUND");

  let body: ReturnType<typeof InquiryUpdateSchema.parse>;
  try {
    body = InquiryUpdateSchema.parse(await req.json());
  } catch {
    return fail("INVALID_INPUT");
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .update({ status: body.status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[admin/inquiries patch] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");

  return ok(data);
}
