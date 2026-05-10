import { type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { SlugSchema } from "@/lib/admin/schemas";

const FULL_SELECT =
  "id, slug, title_ja, title_en, title_tl, body_ja, body_en, body_tl, prefecture_code, city_name, published_at, updated_at, category:categories(id, slug, name_ja, name_en, name_tl)";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SlugSchema.safeParse(slug).success) return fail("INVALID_INPUT", "slug");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select(FULL_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[public/articles/slug GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");
  return ok(data);
}
