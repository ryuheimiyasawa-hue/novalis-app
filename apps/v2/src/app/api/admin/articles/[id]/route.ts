import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { ArticleUpdateSchema } from "@/lib/admin/schemas";
import { revalidateArticles } from "@/lib/cache/revalidate-content";
import { reindexArticleSafe, removeEmbeddingsSafe } from "@/lib/ai/reindex";
import type { Database } from "@/types/database";

type ArticleUpdate = Database["public"]["Tables"]["articles"]["Update"];

const UuidSchema = z.string().uuid();

const FULL_SELECT =
  "id, category_id, slug, status, title_ja, title_en, title_tl, body_ja, body_en, body_tl, prefecture_code, city_name, author_id, published_at, video_url, video_provider, created_at, updated_at";

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
    .from("articles")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/articles GET id] db error:", error.message);
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

  let body: z.infer<typeof ArticleUpdateSchema>;
  try {
    body = ArticleUpdateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }
  if (Object.keys(body).length === 0)
    return fail("INVALID_INPUT", "no fields to update");

  const admin = getAdminClient();

  // For status transitions we need to read the current row so the first
  // publish stamps published_at while subsequent (re-)publishes preserve it.
  // (W3-design.md §4-2.)
  const updates: ArticleUpdate = { ...body };
  if (body.status === "published") {
    const { data: current, error: readErr } = await admin
      .from("articles")
      .select("published_at")
      .eq("id", id)
      .maybeSingle();
    if (readErr) {
      console.error("[admin/articles PATCH] read error:", readErr.message);
      return fail("INTERNAL_ERROR");
    }
    if (!current) return fail("NOT_FOUND");
    if (!current.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await admin
    .from("articles")
    .update(updates)
    .eq("id", id)
    .select(FULL_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return fail("CONFLICT", "slug already exists");
    if (error.code === "23503")
      return fail("INVALID_INPUT", "category_id does not exist");
    console.error("[admin/articles PATCH] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");
  // Always invalidate detail (slug may have changed, status may have
  // toggled draft<->published) plus the index pages.
  revalidateArticles({ slug: data.slug });
  // Keep RAG embeddings in sync with the new content / status (publish
  // inserts, unpublish removes). Non-fatal: the row is already saved.
  await reindexArticleSafe(id);
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

  // Capture slug before delete so we can invalidate the detail page
  // alongside the index. Best-effort: if the row is already gone we
  // still revalidate the index.
  const { data: target } = await admin
    .from("articles")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("articles").delete().eq("id", id);
  if (error) {
    console.error("[admin/articles DELETE] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  revalidateArticles(target ? { slug: target.slug } : undefined);
  // content_embeddings has no FK to articles, so the delete does not
  // cascade — remove the orphaned embeddings explicitly. Non-fatal.
  await removeEmbeddingsSafe("article", id);
  return ok({ id });
}
