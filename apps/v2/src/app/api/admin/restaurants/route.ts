import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import {
  RestaurantCreateSchema,
  RestaurantListQuerySchema,
} from "@/lib/admin/schemas";
import { revalidateRestaurants } from "@/lib/cache/revalidate-content";

const LIST_SELECT =
  "id, name, prefecture_code, city_name, cuisine_type, is_active, created_at";

export async function GET(req: NextRequest) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const url = new URL(req.url);
  const parsed = RestaurantListQuerySchema.safeParse({
    prefecture_code: url.searchParams.get("prefecture_code") ?? undefined,
    cuisine_type: url.searchParams.get("cuisine_type") ?? undefined,
    is_active: url.searchParams.get("is_active") ?? undefined,
  });
  if (!parsed.success)
    return fail("INVALID_INPUT", parsed.error.issues[0]?.message);

  const admin = getAdminClient();
  let query = admin
    .from("restaurants")
    .select(LIST_SELECT)
    .order("created_at", { ascending: false });

  if (parsed.data.prefecture_code)
    query = query.eq("prefecture_code", parsed.data.prefecture_code);
  if (parsed.data.cuisine_type)
    query = query.eq("cuisine_type", parsed.data.cuisine_type);
  if (parsed.data.is_active !== undefined)
    query = query.eq("is_active", parsed.data.is_active === "true");

  const { data, error } = await query;
  if (error) {
    console.error("[admin/restaurants GET] db error:", error.message);
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

  let body: z.infer<typeof RestaurantCreateSchema>;
  try {
    body = RestaurantCreateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("restaurants")
    .insert(body)
    .select(LIST_SELECT)
    .single();

  if (error) {
    console.error("[admin/restaurants POST] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (data.is_active) revalidateRestaurants({ id: data.id });
  return ok(data, { status: 201 });
}
