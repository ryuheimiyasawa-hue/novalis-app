import { type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import {
  PublicArticleListQuerySchema,
  escapeLike,
} from "@/lib/public/schemas";

// Article LIST omits body_* — at 50K chars × 3 locales × 20 rows the
// payload would balloon to ~3MB. The detail endpoint returns the full
// row in all 3 locales for client-side locale switching without
// re-fetching.
const LIST_SELECT =
  "id, slug, title_ja, title_en, title_tl, prefecture_code, city_name, published_at, category:categories(id, slug, name_ja, name_en, name_tl)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = PublicArticleListQuerySchema.safeParse({
    category_slug: url.searchParams.get("category_slug") ?? undefined,
    prefecture_code: url.searchParams.get("prefecture_code") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success)
    return fail("INVALID_INPUT", parsed.error.issues[0]?.message);

  const page = parsed.data.page ?? 1;
  const limit = parsed.data.limit ?? 20;
  const offset = (page - 1) * limit;

  const admin = getAdminClient();

  // Resolve category_slug -> id (one extra round-trip, cacheable later).
  let categoryId: string | undefined;
  if (parsed.data.category_slug) {
    const { data: cat, error: catErr } = await admin
      .from("categories")
      .select("id")
      .eq("slug", parsed.data.category_slug)
      .maybeSingle();
    if (catErr) {
      console.error("[public/articles GET] cat lookup:", catErr.message);
      return fail("INTERNAL_ERROR");
    }
    if (!cat) return ok({ items: [], total: 0, page, limit });
    categoryId = cat.id;
  }

  let query = admin
    .from("articles")
    .select(LIST_SELECT, { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (categoryId) query = query.eq("category_id", categoryId);
  if (parsed.data.prefecture_code)
    query = query.eq("prefecture_code", parsed.data.prefecture_code);
  if (parsed.data.q)
    query = query.ilike("title_ja", `%${escapeLike(parsed.data.q)}%`);

  const { data, count, error } = await query;
  if (error) {
    console.error("[public/articles GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ items: data, total: count ?? 0, page, limit });
}
