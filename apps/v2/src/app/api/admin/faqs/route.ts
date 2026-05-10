import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { FaqCreateSchema, FaqListQuerySchema } from "@/lib/admin/schemas";

const LIST_SELECT =
  "id, category_id, question_ja, prefecture_code, is_published, sort_order, updated_at, created_at, category:categories(id, slug, name_ja)";

export async function GET(req: NextRequest) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const url = new URL(req.url);
  const parsed = FaqListQuerySchema.safeParse({
    category_id: url.searchParams.get("category_id") ?? undefined,
    is_published: url.searchParams.get("is_published") ?? undefined,
  });
  if (!parsed.success)
    return fail("INVALID_INPUT", parsed.error.issues[0]?.message);

  const admin = getAdminClient();
  let query = admin
    .from("faqs")
    .select(LIST_SELECT)
    // Editors typically arrange by category first, then by intentional
    // sort_order within. updated_at as a tertiary tiebreaker keeps newly
    // edited rows near the top of their bucket.
    .order("category_id", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (parsed.data.category_id) query = query.eq("category_id", parsed.data.category_id);
  if (parsed.data.is_published !== undefined)
    query = query.eq("is_published", parsed.data.is_published === "true");

  const { data, error } = await query;
  if (error) {
    console.error("[admin/faqs GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}

export async function POST(req: NextRequest) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  let body: z.infer<typeof FaqCreateSchema>;
  try {
    body = FaqCreateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .insert(body)
    .select(
      "id, category_id, question_ja, prefecture_code, is_published, sort_order, updated_at, created_at",
    )
    .single();

  if (error) {
    if (error.code === "23503")
      return fail("INVALID_INPUT", "category_id does not exist");
    console.error("[admin/faqs POST] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data, { status: 201 });
}
