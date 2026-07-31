import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type LinkOutcome =
  | { status: "linked"; userId: string }
  | { status: "invalid_code" }
  | { status: "error" };

/**
 * Exchange a link code for a messenger_links row.
 *
 * The claim is a conditional UPDATE (unused AND unexpired) RETURNING user_id,
 * so it is atomic: a duplicate Messenger delivery, or two people racing on the
 * same code, can only succeed once.
 *
 * One Novalis account maps to one Messenger account — any previous link for
 * the same user is removed first, which is also how re-linking from a
 * different Facebook account works.
 */
export async function linkMessengerAccount(
  admin: SupabaseClient<Database>,
  code: string,
  psid: string,
  now: Date = new Date(),
): Promise<LinkOutcome> {
  const claim = await admin
    .from("messenger_link_codes")
    .update({ used_at: now.toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .select("user_id")
    .maybeSingle<{ user_id: string }>();

  if (claim.error) {
    console.error("[messenger] link code claim failed:", claim.error.message);
    return { status: "error" };
  }
  if (!claim.data) return { status: "invalid_code" };

  const userId = claim.data.user_id;

  const cleanup = await admin
    .from("messenger_links")
    .delete()
    .eq("user_id", userId);
  if (cleanup.error) {
    console.error("[messenger] link cleanup failed:", cleanup.error.message);
    return { status: "error" };
  }

  const insert = await admin
    .from("messenger_links")
    .insert({ user_id: userId, messenger_psid: psid });
  if (insert.error) {
    console.error("[messenger] link insert failed:", insert.error.message);
    return { status: "error" };
  }

  return { status: "linked", userId };
}
