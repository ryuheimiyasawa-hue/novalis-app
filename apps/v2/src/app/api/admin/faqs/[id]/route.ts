import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { FaqUpdateSchema } from "@/lib/admin/schemas";

const UuidSchema = z.string().uuid();

const FULL_SELECT =
  "id, category_id, question_ja, question_en, question_tl, answer_ja, answer_en, answer_tl, prefecture_code, is_published, sort_order, created_at, updated_at";

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
    .from("faqs")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/faqs GET id] db error:", error.message);
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

  let body: z.infer<typeof FaqUpdateSchema>;
  try {
    body = FaqUpdateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }
  if (Object.keys(body).length === 0)
    return fail("INVALID_INPUT", "no fields to update");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .update(body)
    .eq("id", id)
    .select(FULL_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === "23503")
      return fail("INVALID_INPUT", "category_id does not exist");
    console.error("[admin/faqs PATCH] db error:", error.message);
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
  const { error } = await admin.from("faqs").delete().eq("id", id);
  if (error) {
    console.error("[admin/faqs DELETE] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ id });
}
