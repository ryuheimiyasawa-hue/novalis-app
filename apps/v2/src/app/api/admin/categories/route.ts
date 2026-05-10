import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { CategoryCreateSchema } from "@/lib/admin/schemas";
import { revalidateCategories } from "@/lib/cache/revalidate-content";

export async function GET() {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select(
      "id, slug, name_ja, name_en, name_tl, icon, sort_order, is_system, created_at",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/categories GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  let body: z.infer<typeof CategoryCreateSchema>;
  try {
    body = CategoryCreateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("categories")
    .insert(body)
    .select(
      "id, slug, name_ja, name_en, name_tl, icon, sort_order, is_system, created_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") return fail("CONFLICT", "slug already exists");
    console.error("[admin/categories POST] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  revalidateCategories({ slug: data.slug });
  return ok(data, { status: 201 });
}
