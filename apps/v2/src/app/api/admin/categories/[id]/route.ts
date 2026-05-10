import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { CategoryUpdateSchema } from "@/lib/admin/schemas";
import {
  checkDeleteAllowed,
  checkSlugRenameAllowed,
} from "@/lib/admin/system-category-guard";
import { revalidateCategories } from "@/lib/cache/revalidate-content";

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

  // Block slug rename on system categories. Renaming would silently break
  // any AI routing or hardcoded reference that targets the original slug.
  // Other fields (name_*, icon, sort_order) remain editable so admins can
  // refine display text without affecting the routing key.
  if (body.slug !== undefined) {
    const { data: target, error: readErr } = await admin
      .from("categories")
      .select("slug, is_system")
      .eq("id", id)
      .maybeSingle();
    if (readErr) {
      console.error("[admin/categories PATCH] read error:", readErr.message);
      return fail("INTERNAL_ERROR");
    }
    if (!target) return fail("NOT_FOUND");
    const guard = checkSlugRenameAllowed(target, body.slug);
    if (!guard.ok) {
      return fail(
        "FORBIDDEN",
        `system category slug "${target.slug}" cannot be renamed`,
      );
    }
  }

  const { data, error } = await admin
    .from("categories")
    .update(body)
    .eq("id", id)
    .select(
      "id, slug, name_ja, name_en, name_tl, icon, sort_order, is_system, created_at",
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return fail("CONFLICT", "slug already exists");
    console.error("[admin/categories PATCH] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");
  revalidateCategories({ slug: data.slug });
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

  // Block deletion of system (seed) categories before doing anything else.
  // These rows back AI chat routing, the public category navigation, and
  // hardcoded fallbacks. The flag lives in the DB (migration 003) so a
  // future operator inspecting Supabase Dashboard can see the protection.
  const { data: target, error: targetErr } = await admin
    .from("categories")
    .select("is_system, name_ja, slug")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) {
    console.error("[admin/categories DELETE] target read failed:", targetErr.message);
    return fail("INTERNAL_ERROR");
  }
  if (!target) return fail("NOT_FOUND");
  const deleteGuard = checkDeleteAllowed({
    slug: "", // delete guard only needs is_system; slug unused
    is_system: target.is_system,
  });
  if (!deleteGuard.ok) {
    return fail(
      "FORBIDDEN",
      `system category "${target.name_ja}" cannot be deleted`,
    );
  }

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
  revalidateCategories({ slug: target.slug });
  return ok({ id });
}
