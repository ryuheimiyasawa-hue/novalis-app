// Slack notification for new inquiries (P2-M follow-up).
//
// Privacy: we deliberately send only the subject + a link to the admin
// inbox — never the message body or the contact email — so personal
// information stays inside the app and out of the Slack channel.
//
// Reliability: this must never break inquiry submission. It is env-gated
// (no webhook URL => no-op), time-boxed, and swallows every error.

// Slack mrkdwn treats &, <, > specially and uses <url|text> for links,
// so a crafted subject could inject a fake link. Escape the three chars
// per Slack's guidance before embedding user input.
export function escapeSlackText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildInquirySlackText(subject: string, link: string): string {
  const trimmed = subject.length > 120 ? `${subject.slice(0, 120)}…` : subject;
  const safeSubject = escapeSlackText(trimmed);
  return [
    ":mailbox_with_mail: 新しい問い合わせが届きました",
    `*件名:* ${safeSubject}`,
    `<${link}|受信箱で開く>`,
  ].join("\n");
}

export async function notifyNewInquiry(inquiry: {
  id: string;
  subject: string;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_INQUIRY_WEBHOOK_URL;
  if (!webhookUrl) return; // notifications disabled

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${appUrl}/admin/inquiries/${inquiry.id}`;
  const text = buildInquirySlackText(inquiry.subject, link);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch (e) {
    // Never fail the inquiry because Slack is slow/down.
    console.error(
      "[inquiries] slack notify failed:",
      e instanceof Error ? e.message : e,
    );
  } finally {
    clearTimeout(timer);
  }
}
