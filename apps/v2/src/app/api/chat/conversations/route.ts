import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";

// List the caller's conversations, newest first. RLS would normally
// scope to `auth.uid()` but we run through the admin client so the
// API can join across rows; the `eq("user_id", caller.id)` clause is
// what enforces ownership.

export async function GET() {
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("conversations")
    .select("id, channel, title, mode, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[chat/conversations GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}
