import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import {
  ArticleCreateSchema,
  ArticleListQuerySchema,
} from "@/lib/admin/schemas";
import { revalidateArticles } from "@/lib/cache/revalidate-content";
import { reindexArticleSafe } from "@/lib/ai/reindex";

const LIST_SELECT =
  "id, category_id, slug, status, title_ja, prefecture_code, published_at, updated_at, created_at, category:categories(id, slug, name_ja)";

export async function GET(req: NextRequest) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const url = new URL(req.url);
  const parsed = ArticleListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    category_id: url.searchParams.get("category_id") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_INPUT", parsed.error.issues[0]?.message);

  const admin = getAdminClient();
  let query = admin
    .from("articles")
    .select(LIST_SELECT)
    .order("updated_at", { ascending: false });

  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  if (parsed.data.category_id)
    query = query.eq("category_id", parsed.data.category_id);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/articles GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}

export async function POST(req: NextRequest) {
  let editorId: string;
  try {
    const ctx = await requireEditor();
    editorId = ctx.user.id;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  let body: z.infer<typeof ArticleCreateSchema>;
  try {
    body = ArticleCreateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const status = body.status ?? "draft";
  const insert = {
    ...body,
    status,
    author_id: editorId,
    // First publish: stamp published_at; draft starts NULL.
    published_at: status === "published" ? new Date().toISOString() : null,
  };

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("articles")
    .insert(insert)
    .select(
      "id, category_id, slug, status, title_ja, prefecture_code, published_at, updated_at, created_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") return fail("CONFLICT", "slug already exists");
    if (error.code === "23503")
      return fail("INVALID_INPUT", "category_id does not exist");
    console.error("[admin/articles POST] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  // Only revalidate detail page when the new article is published.
  // Drafts are not exposed publicly so their cache is irrelevant.
  revalidateArticles(
    data.status === "published" ? { slug: data.slug } : undefined,
  );
  // Embed the new article if it was created already-published. Non-fatal.
  await reindexArticleSafe(data.id);
  return ok(data, { status: 201 });
}
