import { type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { PublicFaqListQuerySchema, escapeLike } from "@/lib/public/schemas";

// FAQs: answers fit comfortably in 10K, so we return all 3 locales for
// both list and detail. No pagination yet — total volume is expected
// to stay under a few hundred for the foreseeable future.
const SELECT =
  "id, question_ja, question_en, question_tl, answer_ja, answer_en, answer_tl, prefecture_code, sort_order, updated_at, category:categories(id, slug, name_ja, name_en, name_tl)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = PublicFaqListQuerySchema.safeParse({
    category_slug: url.searchParams.get("category_slug") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success)
    return fail("INVALID_INPUT", parsed.error.issues[0]?.message);

  const admin = getAdminClient();

  let categoryId: string | undefined;
  if (parsed.data.category_slug) {
    const { data: cat, error: catErr } = await admin
      .from("categories")
      .select("id")
      .eq("slug", parsed.data.category_slug)
      .maybeSingle();
    if (catErr) {
      console.error("[public/faqs GET] cat lookup:", catErr.message);
      return fail("INTERNAL_ERROR");
    }
    if (!cat) return ok([]);
    categoryId = cat.id;
  }

  let query = admin
    .from("faqs")
    .select(SELECT)
    .eq("is_published", true)
    .order("category_id", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (categoryId) query = query.eq("category_id", categoryId);
  if (parsed.data.q)
    query = query.ilike("question_ja", `%${escapeLike(parsed.data.q)}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[public/faqs GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}
