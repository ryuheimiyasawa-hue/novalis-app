import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { CategoryUpdateSchema } from "@/lib/admin/schemas";

const UuidSchema = z.string().uuid();

export async function PATCH(
  req: NextRequest,
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

  let body: z.infer<typeof CategoryUpdateSchema>;
  try {
    body = CategoryUpdateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }
  if (Object.keys(body).length === 0) {
    return fail("INVALID_INPUT", "no fields to update");
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("categories")
    .update(body)
    .eq("id", id)
    .select("id, slug, name_ja, name_en, name_tl, icon, sort_order, created_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return fail("CONFLICT", "slug already exists");
    console.error("[admin/categories PATCH] db error:", error.message);
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

  // Refuse if any article or faq still references this category. The DB has
  // ON DELETE NO ACTION (the default), so the FK error would surface as a
  // generic 23503; we precheck so the operator sees a clear message.
  const [articles, faqs] = await Promise.all([
    admin.from("articles").select("id", { count: "exact", head: true }).eq("category_id", id),
    admin.from("faqs").select("id", { count: "exact", head: true }).eq("category_id", id),
  ]);
  if (articles.error || faqs.error) {
    console.error(
      "[admin/categories DELETE] precheck failed:",
      articles.error?.message ?? faqs.error?.message,
    );
    return fail("INTERNAL_ERROR");
  }
  const refCount = (articles.count ?? 0) + (faqs.count ?? 0);
  if (refCount > 0) {
    return fail(
      "CONFLICT",
      `cannot delete: ${refCount} article(s)/faq(s) still reference this category`,
    );
  }

  const { error } = await admin.from("categories").delete().eq("id", id);
  if (error) {
    console.error("[admin/categories DELETE] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ id });
}
