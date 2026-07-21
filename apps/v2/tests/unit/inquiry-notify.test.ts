import { describe, expect, it } from "vitest";
import {
  escapeSlackText,
  buildInquirySlackText,
} from "@/lib/inquiries/notify";

describe("escapeSlackText", () => {
  it("escapes &, < and > per Slack mrkdwn rules", () => {
    expect(escapeSlackText("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("neutralises an injected fake link", () => {
    // A subject crafted to look like a Slack link must not stay a link.
    const out = escapeSlackText("<http://evil.example|click me>");
    expect(out).not.toContain("<http");
    expect(out).toContain("&lt;http");
  });
});

describe("buildInquirySlackText", () => {
  it("includes the subject and a link, and no PII placeholders", () => {
    const text = buildInquirySlackText(
      "在留資格について",
      "https://app.example/admin/inquiries/abc",
    );
    expect(text).toContain("在留資格について");
    expect(text).toContain("<https://app.example/admin/inquiries/abc|受信箱で開く>");
    expect(text).toContain("新しい問い合わせが届きました");
  });

  it("truncates an overly long subject", () => {
    const long = "あ".repeat(200);
    const text = buildInquirySlackText(long, "https://app.example/x");
    expect(text).toContain("…");
    // 120 kept + ellipsis, not the full 200
    expect(text).not.toContain("あ".repeat(200));
  });

  it("escapes an injected subject before embedding", () => {
    const text = buildInquirySlackText(
      "<https://evil|x>",
      "https://app.example/x",
    );
    expect(text).toContain("&lt;https://evil|x&gt;");
  });
});
