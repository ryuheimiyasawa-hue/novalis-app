import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import {
  generateLinkCode,
  linkCodeExpiry,
  CODE_TTL_MINUTES,
} from "@/lib/messenger/link-code";

// Issue a short-lived code the user carries from this authenticated session
// into the (unauthenticated) Messenger thread. The webhook exchanges it for a
// messenger_links row. Service-role writes: messenger_link_codes is RLS-on
// with no policies (009).
//
// Node runtime: generateLinkCode uses node:crypto.
export const runtime = "nodejs";

const MAX_INSERT_ATTEMPTS = 5;

export async function POST() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  // Anonymous beta sessions are browser-local and disposable; binding a
  // Messenger account to one would strand the link when the session is purged.
  // Same policy as inquiries (migrations 007/008).
  if (user.is_anonymous === true) {
    return fail("FORBIDDEN", "anonymous users cannot link Messenger");
  }

  const admin = getAdminClient();

  // Keep at most one live code per user: burn any outstanding ones first so a
  // previously screenshotted code stops working the moment a new one is shown.
  const invalidate = await admin
    .from("messenger_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("used_at", null);
  if (invalidate.error) {
    console.error(
      "[messenger/link-code] invalidate failed:",
      invalidate.error.message,
    );
    return fail("INTERNAL_ERROR");
  }

  const expiresAt = linkCodeExpiry();

  // Retry on the (astronomically unlikely) PK collision rather than returning
  // an error the user can do nothing about.
  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
    const code = generateLinkCode();
    const { error } = await admin.from("messenger_link_codes").insert({
      code,
      user_id: user.id,
      expires_at: expiresAt.toISOString(),
    });
    if (!error) {
      return ok({
        code,
        expires_at: expiresAt.toISOString(),
        ttl_minutes: CODE_TTL_MINUTES,
      });
    }
    if (error.code !== "23505") {
      console.error("[messenger/link-code] insert failed:", error.message);
      return fail("INTERNAL_ERROR");
    }
  }

  console.error("[messenger/link-code] exhausted code generation attempts");
  return fail("INTERNAL_ERROR");
}
