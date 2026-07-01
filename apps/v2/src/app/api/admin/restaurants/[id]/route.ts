import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { RestaurantUpdateSchema } from "@/lib/admin/schemas";
import { revalidateRestaurants } from "@/lib/cache/revalidate-content";

const UuidSchema = z.string().uuid();

const FULL_SELECT =
  "id, name, prefecture_code, city_name, address, lat, lng, cuisine_type, hours, photo_url, description_ja, description_en, description_tl, is_active, created_at";

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
    .from("restaurants")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/restaurants GET id] db error:", error.message);
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

  let body: z.infer<typeof RestaurantUpdateSchema>;
  try {
    body = RestaurantUpdateSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }
  if (Object.keys(body).length === 0)
    return fail("INVALID_INPUT", "no fields to update");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("restaurants")
    .update(body)
    .eq("id", id)
    .select(FULL_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[admin/restaurants PATCH] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  if (!data) return fail("NOT_FOUND");
  // is_active may have toggled; always invalidate the list + this detail page.
  revalidateRestaurants({ id });
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
  const { error } = await admin.from("restaurants").delete().eq("id", id);
  if (error) {
    console.error("[admin/restaurants DELETE] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  revalidateRestaurants({ id });
  return ok({ id });
}
