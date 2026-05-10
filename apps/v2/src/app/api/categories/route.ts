import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";

// Public: returns every category with name in all 3 locales. The client
// picks which locale to render. Categories are a navigation aid and do
// not have a publish/unpublish toggle (system rows are protected at
// destructive endpoints — see migration 003).
export async function GET() {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select("id, slug, name_ja, name_en, name_tl, icon, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[public/categories GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}
