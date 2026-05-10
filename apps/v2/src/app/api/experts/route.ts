import { type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { PublicExpertListQuerySchema } from "@/lib/public/schemas";

// Public expert directory. Only is_active=true rows are exposed; the
// admin can soft-disable an expert without deleting their inquiry
// history.
const SELECT =
  "id, name, title, specialty_ja, specialty_en, specialty_tl, bio_ja, bio_en, bio_tl, prefecture_code, city_name, avatar_url, calendar_url";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = PublicExpertListQuerySchema.safeParse({
    prefecture_code: url.searchParams.get("prefecture_code") ?? undefined,
  });
  if (!parsed.success)
    return fail("INVALID_INPUT", parsed.error.issues[0]?.message);

  const admin = getAdminClient();
  let query = admin
    .from("experts")
    .select(SELECT)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (parsed.data.prefecture_code)
    query = query.eq("prefecture_code", parsed.data.prefecture_code);

  const { data, error } = await query;
  if (error) {
    console.error("[public/experts GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}
