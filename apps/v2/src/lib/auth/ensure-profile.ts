import type { User } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export interface EnsureProfileResult {
  isNew: boolean;
}

const TRIAL_DAYS = 30;

// Idempotently ensures a profiles row exists for the given auth user.
// Designed to converge regardless of race with handle_new_user trigger:
//   - If profiles row exists  -> bump updated_at, return { isNew: false }
//   - If absent               -> insert with defaults; on PK conflict
//                                (trigger won the race), return existing
//                                state without raising
// See tasks/W2-design.md §7 S5.
export async function ensureProfile(user: User): Promise<EnsureProfileResult> {
  const admin = getAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    await admin
      .from("profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", user.id);
    return { isNew: false };
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  // Anonymous users (Supabase signInAnonymously) bypass the consent +
  // prefecture onboarding form so they can immediately try the chat.
  // We mark onboarded_at and age_verified at insert time so the proxy
  // does not bounce them back to /onboarding. Real users still go
  // through the form on first FB OAuth / email signup.
  const isAnon = user.is_anonymous === true;
  const onboardedAt = isAnon ? trialStart.toISOString() : null;

  const { error } = await admin.from("profiles").insert({
    id: user.id,
    facebook_id: stringOr(meta.provider_id, user.id),
    display_name: stringOr(
      meta.full_name,
      stringOr(meta.name, isAnon ? "Guest" : "User"),
    ),
    email: user.email ?? null,
    avatar_url: stringOr(meta.avatar_url, null),
    prefecture_code: "",
    city_name: "",
    trial_started_at: trialStart.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
    onboarded_at: onboardedAt,
    age_verified: isAnon,
  });

  // 23505 = unique_violation: trigger inserted the row between our SELECT and INSERT.
  // Treat as the existing-row branch (idempotent convergence).
  if (error && error.code !== "23505") {
    throw new Error(`ensureProfile insert failed: ${error.message}`);
  }
  return { isNew: error?.code !== "23505" };
}

function stringOr<T extends string | null>(value: unknown, fallback: T): string | T {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
