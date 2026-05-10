import { describe, expect, it } from "vitest";
import {
  getAnswerDisclaimer,
  getEscalationMessage,
  getPiiBlockMessage,
  getTooLongMessage,
} from "@/lib/ai/disclaimers";

// These tests pin the contract that the chat copy is sourced from
// `messages/{ja,en,tl}.json` under the `chat` namespace. If a key is
// removed or a locale gets out of sync, this fails before the
// pipeline silently falls through to undefined.

describe("disclaimers i18n source", () => {
  it.each(["ja", "en", "tl"] as const)("provides all four strings for %s", (locale) => {
    expect(getAnswerDisclaimer(locale)).toMatch(/.+/);
    expect(getEscalationMessage(locale)).toMatch(/.+/);
    expect(getPiiBlockMessage(locale)).toMatch(/.+/);
    expect(getTooLongMessage(locale)).toMatch(/.+/);
  });

  it("returns the Japanese escalation copy verbatim from messages/ja.json", () => {
    expect(getEscalationMessage("ja")).toBe(
      "ご質問の内容は個別の状況に応じた専門的な判断が必要なため、専門家にご相談されることをお勧めします。Novalis 提携の士業窓口を以下にご紹介します。",
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
