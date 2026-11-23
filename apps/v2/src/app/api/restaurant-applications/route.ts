import { type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import {
  APPLICATIONS_PER_IP_PER_HOUR,
  RestaurantApplicationSchema,
  clientIp,
  hashIp,
} from "@/lib/restaurant-applications/schema";

// Public (no login): restaurants invited by email list themselves here.
// The row is stored as 'pending' and is only published after an admin
// approves it in /admin/restaurant-applications.

const MAX_BODY_BYTES = 16_000;

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail("INVALID_INPUT", "too_large");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("INVALID_INPUT", "invalid_json");
  }

  const parsed = RestaurantApplicationSchema.safeParse(json);
  if (!parsed.success) {
    // The first failing field name is enough for the form to highlight it.
    const field = parsed.error.issues[0]?.path.join(".") || "unknown";
    return fail("INVALID_INPUT", field);
  }
  const input = parsed.data;

  // Honeypot filled: pretend success, store nothing.
  if (input.company_website) {
    console.info(JSON.stringify({ event: "restaurant_apply_honeypot", request_id: requestId }));
    return ok({ status: "received" }, { status: 201 });
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    console.error(JSON.stringify({ event: "restaurant_apply_no_secret", request_id: requestId }));
    return fail("INTERNAL_ERROR");
  }
  const ipHash = hashIp(clientIp(req.headers), secret);
  const admin = getAdminClient();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("restaurant_applications")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) {
    console.error(
      JSON.stringify({
        event: "restaurant_apply_count_failed",
        request_id: requestId,
        error: countError.message,
      }),
    );
    return fail("INTERNAL_ERROR");
  }
  if ((count ?? 0) >= APPLICATIONS_PER_IP_PER_HOUR) {
    return fail("RATE_LIMITED");
  }

  const { error } = await admin.from("restaurant_applications").insert({
    name: input.name,
    prefecture_code: input.prefecture_code,
    city_name: input.city_name,
    address: input.address,
    hours: input.hours,
    phone: input.phone,
    website_url: input.website_url,
    description: input.description,
    description_lang: input.description_lang,
    contact_name: input.contact_name,
    contact_email: input.contact_email,
    source_code: input.source_code,
    ip_hash: ipHash,
  });

  if (error) {
    // Same shop (name + phone) already waiting for review: not an error
    // for the shop, they have simply sent the form twice.
    if (error.code === "23505") {
      return ok({ status: "already_received" });
    }
    console.error(
      JSON.stringify({
        event: "restaurant_apply_insert_failed",
        request_id: requestId,
        error: error.message,
      }),
    );
    return fail("INTERNAL_ERROR");
  }

  console.info(
    JSON.stringify({
      event: "restaurant_apply_received",
      request_id: requestId,
      source_code: input.source_code,
      prefecture_code: input.prefecture_code,
    }),
  );
  return ok({ status: "received" }, { status: 201 });
}
