import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { ExpertUpdateSchema } from "@/lib/admin/schemas";

const UuidSchema = z.string().uuid();

const FULL_SELECT =
  "id, name, title, specialty_ja, specialty_en, specialty_tl, bio_ja, bio_en, bio_tl, prefecture_code, city_name, avatar_url, calendar_url, is_active, created_at";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return fail("INVALID_INPUT", "id");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("experts")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/experts GET id] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");
  return ok(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return fail("INVALID_INPUT", "id");

  let body: z.infer<typeof ExpertUpdateSchema>;
  try {
    body = ExpertUpdateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }
  if (Object.keys(body).length === 0)
    return fail("INVALID_INPUT", "no fields to update");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("experts")
    .update(body)
    .eq("id", id)
    .select(FULL_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[admin/experts PATCH] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");
  return ok(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return fail("INVALID_INPUT", "id");

  const admin = getAdminClient();

  // Refuse if any inquiry still references this expert. The DB has the
  // default ON DELETE NO ACTION on inquiries.expert_id, so the FK error
  // would surface as a generic 23503; precheck so the operator sees a
  // clear count + recommendation.
  const inquiries = await admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("expert_id", id);
  if (inquiries.error) {
    console.error("[admin/experts DELETE] precheck failed:", inquiries.error.message);
    return fail("INTERNAL_ERROR");
  }
  if ((inquiries.count ?? 0) > 0) {
    return fail(
      "CONFLICT",
      `cannot delete: ${inquiries.count} inquiry(ies) reference this expert. Set is_active=false instead`,
    );
  }

  const { error } = await admin.from("experts").delete().eq("id", id);
  if (error) {
    console.error("[admin/experts DELETE] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ id });
}
