import { getAdminClient } from "@/lib/supabase/admin";
import { escapeSlackText } from "@/lib/inquiries/notify";

// Slack alert when a conversation escalates (P2-B2 follow-up).
//
// Why this exists: P2-B2 gave staff the ability to take a conversation
// over, but no way to learn that one needs taking over. Without this the
// only surface is remembering to open /admin/conversations and look —
// which, for a user who has just been told "please consult a
// professional", is not a workflow.
//
// Privacy: the payload carries no message content, no user id, and no
// PII — only the routing reason, the locale, and a link that still
// requires an admin session to open. Same principle as the inquiry
// notifier: personal information stays in the app, out of Slack.
//
// Reliability: env-gated (no webhook => no-op), time-boxed, and it never
// throws. An escalation reply must not fail because Slack is down.

const REASON_LABEL: Record<string, string> = {
  keyword: "キーワード判定",
  llm_individual: "LLM が個別助言と判定",
  llm_failsafe: "LLM 失敗によるフェイルセーフ",
  safety_block: "セーフティブロック",
};

const LOCALE_LABEL: Record<string, string> = {
  ja: "日本語",
  en: "English",
  tl: "Tagalog",
};

export function buildEscalationSlackText(args: {
  reason: string;
  locale: string;
  link: string;
}): string {
  const reason = REASON_LABEL[args.reason] ?? args.reason;
  const locale = LOCALE_LABEL[args.locale] ?? args.locale;
  return [
    ":raising_hand: 専門家対応が必要な会話が発生しました",
    `*理由:* ${escapeSlackText(reason)}　*言語:* ${escapeSlackText(locale)}`,
    `<${args.link}|会話を開いて対応を引き取る>`,
  ].join("\n");
}

/**
 * One alert per conversation, and none once staff are already on it.
 *
 * A user who keeps rephrasing after an escalation can trigger the
 * classifier repeatedly; alerting each time would train the channel to
 * be ignored, which costs more than the missed signal. The first alert
 * is the one that matters — the thread is already linked, and anything
 * after it is visible on the same page.
 */
export function shouldNotifyEscalation(args: {
  escalatedCount: number;
  mode: string;
}): boolean {
  if (args.mode === "operator") return false;
  return args.escalatedCount <= 1;
}

export async function notifyEscalation(args: {
  conversationId: string;
  reason: string;
  locale: string;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_ESCALATION_WEBHOOK_URL;
  if (!webhookUrl) return; // notifications disabled

  try {
    const admin = getAdminClient();

    // Read state only when the webhook is configured, so an unconfigured
    // deployment pays nothing for this path.
    const [{ count }, { data: conv }] = await Promise.all([
      admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", args.conversationId)
        .eq("is_escalated", true),
      admin
        .from("conversations")
        .select("mode")
        .eq("id", args.conversationId)
        .maybeSingle(),
    ]);

    if (
      !shouldNotifyEscalation({
        escalatedCount: count ?? 1,
        mode: conv?.mode ?? "auto",
      })
    ) {
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const text = buildEscalationSlackText({
      reason: args.reason,
      locale: args.locale,
      link: `${appUrl}/admin/conversations/${args.conversationId}`,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Never fail the user's reply because the alert failed.
    console.error(
      "[chat] escalation slack notify failed:",
      e instanceof Error ? e.message : e,
    );
  }
}
