import { describe, expect, it } from "vitest";
import {
  buildEscalationSlackText,
  shouldNotifyEscalation,
} from "@/lib/chat/escalation-notify";

// P2-B2 follow-up. Staff could take a conversation over but had no way
// to learn one needed it. These are the two decisions that shape the
// alert: what goes in it, and whether to send it at all.

describe("buildEscalationSlackText", () => {
  const link = "https://example.com/admin/conversations/abc";

  it("carries the routing reason and the language, and links to the thread", () => {
    const text = buildEscalationSlackText({
      reason: "keyword",
      locale: "tl",
      link,
    });
    expect(text).toContain("キーワード判定");
    expect(text).toContain("Tagalog");
    expect(text).toContain(link);
  });

  it("never carries message content — the payload is only metadata", () => {
    // The whole privacy argument for this alert: an escalated message is
    // by definition someone's specific situation. It stays in the app.
    const text = buildEscalationSlackText({
      reason: "llm_individual",
      locale: "ja",
      link,
    });
    const allowed = ["専門家対応", "理由", "言語", "会話を開いて", "LLM", "日本語", link];
    // Nothing in the message beyond the fixed chrome, labels and link.
    for (const line of text.split("\n")) {
      expect(allowed.some((a) => line.includes(a))).toBe(true);
    }
  });

  it("falls back to the raw values for reasons it does not know", () => {
    const text = buildEscalationSlackText({
      reason: "some_new_reason",
      locale: "xx",
      link,
    });
    expect(text).toContain("some_new_reason");
    expect(text).toContain("xx");
  });

  it("escapes Slack control characters in the values it interpolates", () => {
    // Reason and locale are internal enums today, but they are still
    // interpolated into mrkdwn; a future value containing < or > must not
    // be able to forge a link.
    const text = buildEscalationSlackText({
      reason: "<https://evil.example|click>",
      locale: "ja",
      link,
    });
    expect(text).toContain("&lt;https://evil.example|click&gt;");
    expect(text).not.toContain("<https://evil.example|click>");
  });
});

describe("shouldNotifyEscalation", () => {
  it("alerts on the first escalation of a conversation", () => {
    expect(shouldNotifyEscalation({ escalatedCount: 1, mode: "auto" })).toBe(true);
  });

  it("stays quiet on repeat escalations in the same thread", () => {
    // A user rephrasing after an escalation can trip the classifier over
    // and over; alerting each time trains the channel to be ignored.
    expect(shouldNotifyEscalation({ escalatedCount: 2, mode: "auto" })).toBe(false);
    expect(shouldNotifyEscalation({ escalatedCount: 9, mode: "auto" })).toBe(false);
  });

  it("stays quiet once staff have taken the thread over", () => {
    // A human is already reading it; the alert has no work to prompt.
    expect(shouldNotifyEscalation({ escalatedCount: 1, mode: "operator" })).toBe(
      false,
    );
  });

  it("still alerts if the count comes back as zero", () => {
    // Defensive: a failed count must not silently suppress the alert.
    // Better a duplicate ping than a user waiting unnoticed.
    expect(shouldNotifyEscalation({ escalatedCount: 0, mode: "auto" })).toBe(true);
  });
});
