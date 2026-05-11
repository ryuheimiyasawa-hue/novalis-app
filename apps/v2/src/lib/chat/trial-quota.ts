import { getAdminClient } from "@/lib/supabase/admin";

// Welcome Trial / monthly-quota / payment-flag check for the W5
// chat send endpoint. Pure decision logic lives in evaluateQuota()
// so the gates can be unit-tested without a DB round-trip; the
// async wrapper checkChatQuota() does the data fetching.
//
// Decision order (master plan §0-bis, §2-4, §6-2):
//   1. If NEXT_PUBLIC_PAYMENT_ENABLED=false  -> always allowed (MVP)
//   2. If now < trial_ends_at                -> allowed (Welcome Trial)
//   3. If active subscription                -> allowed
//   4. If currentUsage < freeQuotaPerMonth   -> allowed (free tier)
//   5. Otherwise                             -> blocked (QUOTA_EXCEEDED)
//
// The MVP runs with the flag off so step 1 short-circuits everything
// below. The other branches are kept intact so flipping the flag at
// beta launch is a single env change rather than a code change.

const FREE_QUOTA_PER_MONTH_DEFAULT = 3;

export type QuotaReason =
  | "payment_disabled"
  | "trial"
  | "subscription"
  | "free_quota"
  | "quota_exceeded";

export interface QuotaDecision {
  allowed: boolean;
  reason: QuotaReason;
  /** Remaining free-tier messages this month (only meaningful when reason='free_quota' or 'quota_exceeded'). */
  remaining?: number;
}

export interface QuotaInputs {
  now: Date;
  paymentEnabled: boolean;
  trialEndsAt: Date | null;
  activeSubscription: { status: string; endsAt: Date | null } | null;
  currentUsageCount: number;
  freeQuotaPerMonth?: number;
}

export function evaluateQuota(input: QuotaInputs): QuotaDecision {
  const cap = input.freeQuotaPerMonth ?? FREE_QUOTA_PER_MONTH_DEFAULT;

  if (!input.paymentEnabled) {
    return { allowed: true, reason: "payment_disabled" };
  }

  if (input.trialEndsAt && input.now.getTime() < input.trialEndsAt.getTime()) {
    return { allowed: true, reason: "trial" };
  }

  const sub = input.activeSubscription;
  if (
    sub &&
    sub.status === "active" &&
    sub.endsAt &&
    input.now.getTime() < sub.endsAt.getTime()
  ) {
    return { allowed: true, reason: "subscription" };
  }

  if (input.currentUsageCount < cap) {
    return {
      allowed: true,
      reason: "free_quota",
      remaining: cap - input.currentUsageCount - 1, // count the message we're about to send
    };
  }

  return { allowed: false, reason: "quota_exceeded", remaining: 0 };
}

// "YYYY-MM" string in the supplied IANA timezone (default: Asia/Tokyo).
// JST is used for the monthly counter rollover per master plan §6-2;
// "JST month" means the user's free quota resets at JST midnight on
// the first of each month regardless of the server timezone.
export function periodYyyymm(now: Date, tz = "Asia/Tokyo"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  });
  // en-CA produces "YYYY-MM" via formatToParts; we reconstruct to be safe.
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}

interface ProfileQuotaRow {
  trial_ends_at: string;
}
interface SubscriptionQuotaRow {
  status: string;
  ends_at: string | null;
}
interface ChatUsageQuotaRow {
  message_count: number;
}

/**
 * Async wrapper: fetch the inputs needed by evaluateQuota and call
 * it. Returns the decision plus the period_yyyymm string the caller
 * needs for the subsequent atomic increment.
 */
export async function checkChatQuota(
  userId: string,
  now: Date = new Date(),
): Promise<{ decision: QuotaDecision; period: string }> {
  const paymentEnabled = process.env.NEXT_PUBLIC_PAYMENT_ENABLED === "true";
  const period = periodYyyymm(now);

  // Fast path: when payment is disabled (MVP default) skip the DB
  // round-trips entirely.
  if (!paymentEnabled) {
    return {
      decision: { allowed: true, reason: "payment_disabled" },
      period,
    };
  }

  const admin = getAdminClient();

  const [profileRes, subRes, usageRes] = await Promise.all([
    admin
      .from("profiles")
      .select("trial_ends_at")
      .eq("id", userId)
      .maybeSingle<ProfileQuotaRow>(),
    admin
      .from("subscriptions")
      .select("status, ends_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionQuotaRow>(),
    admin
      .from("chat_usage")
      .select("message_count")
      .eq("user_id", userId)
      .eq("period_yyyymm", period)
      .maybeSingle<ChatUsageQuotaRow>(),
  ]);

  if (profileRes.error) {
    throw new Error(`checkChatQuota profile fetch: ${profileRes.error.message}`);
  }

  const trialEndsAt = profileRes.data?.trial_ends_at
    ? new Date(profileRes.data.trial_ends_at)
    : null;
  const activeSubscription = subRes.data
    ? {
        status: subRes.data.status,
        endsAt: subRes.data.ends_at ? new Date(subRes.data.ends_at) : null,
      }
    : null;
  const currentUsageCount = usageRes.data?.message_count ?? 0;

  const decision = evaluateQuota({
    now,
    paymentEnabled,
    trialEndsAt,
    activeSubscription,
    currentUsageCount,
  });

  return { decision, period };
}
