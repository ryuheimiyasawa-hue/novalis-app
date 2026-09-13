import { describe, expect, it } from "vitest";
import {
  getAnswerDisclaimer,
  getConsentRequiredMessage,
  getEscalationMessage,
  getOperatorPendingMessage,
  getPiiBlockMessage,
  getSmalltalkReply,
  getTooLongMessage,
} from "@/lib/ai/disclaimers";

// These tests pin the contract that the chat copy is sourced from
// `messages/{ja,en,tl}.json` under the `chat` namespace. If a key is
// removed or a locale gets out of sync, this fails before the
// pipeline silently falls through to undefined.

describe("disclaimers i18n source", () => {
  it.each(["ja", "en", "tl"] as const)("provides all six strings for %s", (locale) => {
    expect(getAnswerDisclaimer(locale)).toMatch(/.+/);
    expect(getEscalationMessage(locale)).toMatch(/.+/);
    expect(getPiiBlockMessage(locale)).toMatch(/.+/);
    expect(getTooLongMessage(locale)).toMatch(/.+/);
    expect(getSmalltalkReply(locale)).toMatch(/.+/);
    expect(getOperatorPendingMessage(locale)).toMatch(/.+/);
  });

  it.each(["ja", "en", "tl"] as const)(
    "puts the re-consent link into the Messenger consent message for %s",
    (locale) => {
      const url = `https://example.com/${locale}/consent`;
      const text = getConsentRequiredMessage(locale, url);
      expect(text).toContain(url);
      expect(text).not.toContain("{url}");
    },
  );

  it("returns distinct operator-pending copy per locale (P2-B2)", () => {
    expect(getOperatorPendingMessage("ja")).not.toBe(
      getOperatorPendingMessage("en"),
    );
    expect(getOperatorPendingMessage("en")).not.toBe(
      getOperatorPendingMessage("tl"),
    );
  });

  it("returns the Japanese smalltalk reply verbatim from messages/ja.json", () => {
    expect(getSmalltalkReply("ja")).toMatch(/AI 相談では/);
  });

  it("returns distinct smalltalk replies per locale", () => {
    expect(getSmalltalkReply("ja")).not.toBe(getSmalltalkReply("en"));
    expect(getSmalltalkReply("en")).not.toBe(getSmalltalkReply("tl"));
  });

  // The next two strings are dictated word-for-word by the 2026-08-10
  // lawyer review (docs/lawyer-review-actions.md §2-1, §2-2). The
  // escalation copy is worded to stay clear of 士業への斡旋, and the
  // disclaimer exists to rebut 損害 / 因果関係 / 過失 in a dispute
  // rather than to disclaim liability. Neither may be reworded for
  // tone or brevity without going back to the lawyer.
  it("returns the lawyer-mandated Japanese escalation copy verbatim", () => {
    expect(getEscalationMessage("ja")).toBe(
      "ご質問の内容は個別の状況に応じた専門的な判断が必要なため、お答えすることができません。専門家へのご相談が有効な場合もございますので、参考情報として下記の相談先を記載いたします。ご相談の要否および相談先は、お客様にてご判断ください。",
    );
  });

  it("returns the lawyer-mandated Japanese answer disclaimer verbatim", () => {
    expect(getAnswerDisclaimer("ja")).toBe(
      "私はAIであり、不正確な情報を表示する可能性があるため、ユーザーにおいて応答内容を再確認してください。また、これは一般的な情報提供であり、最終的な判断や個別具体的な判断については専門家にご相談ください。",
    );
  });

  it("returns English answer disclaimer from messages/en.json", () => {
    expect(getAnswerDisclaimer("en")).toMatch(/general information/i);
  });

  it("returns Tagalog PII block from messages/tl.json", () => {
    expect(getPiiBlockMessage("tl")).toMatch(/personal na impormasyon/i);
  });

  it("returns distinct strings per locale (catches accidental cross-pollination)", () => {
    expect(getAnswerDisclaimer("ja")).not.toBe(getAnswerDisclaimer("en"));
    expect(getAnswerDisclaimer("ja")).not.toBe(getAnswerDisclaimer("tl"));
    expect(getAnswerDisclaimer("en")).not.toBe(getAnswerDisclaimer("tl"));
  });
});
