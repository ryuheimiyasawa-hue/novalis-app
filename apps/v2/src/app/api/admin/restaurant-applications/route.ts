import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";

const QuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

const APPLICATION_SELECT =
  "id, name, prefecture_code, city_name, address, hours, phone, website_url, description, description_lang, contact_name, contact_email, source_code, status, restaurant_id, reviewed_at, created_at";

export async function GET(req: NextRequest) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const parsed = QuerySchema.safeParse({
    status: new URL(req.url).searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_INPUT", "status");

  const { data, error } = await getAdminClient()
    .from("restaurant_applications")
    .select(APPLICATION_SELECT)
    .eq("status", parsed.data.status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error(JSON.stringify({ event: "admin_restaurant_apps_list_failed", error: error.message }));
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}
