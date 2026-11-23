import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { revalidateRestaurants } from "@/lib/cache/revalidate-content";

const BodySchema = z.object({ action: z.enum(["approve", "reject"]) });

// Approve copies the application into `restaurants` (published at once,
// is_active=true) inside one DB function, so the two writes succeed or
// fail together. Reject only marks the row. Both act on 'pending' rows
// only: a repeated click answers 409 instead of creating a duplicate.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let reviewerId: string;
  try {
    reviewerId = (await requireEditor()).user.id;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("INVALID_INPUT", "id");

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return fail("INVALID_INPUT", "action");
  }

  const admin = getAdminClient();

  if (body.action === "approve") {
    const { data: restaurantId, error } = await admin.rpc(
      "approve_restaurant_application",
      { p_application_id: id, p_reviewer: reviewerId },
    );
    if (error) {
      console.error(JSON.stringify({ event: "restaurant_app_approve_failed", application_id: id, error: error.message }));
      return fail("INTERNAL_ERROR");
    }
    if (!restaurantId) return fail("CONFLICT", "not_pending");
    revalidateRestaurants({ id: restaurantId });
    return ok({ status: "approved", restaurant_id: restaurantId });
  }

  const { data, error } = await admin
    .from("restaurant_applications")
    .update({ status: "rejected", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error(JSON.stringify({ event: "restaurant_app_reject_failed", application_id: id, error: error.message }));
    return fail("INTERNAL_ERROR");
  }
  if (!data || data.length === 0) return fail("CONFLICT", "not_pending");
  return ok({ status: "rejected" });
}
