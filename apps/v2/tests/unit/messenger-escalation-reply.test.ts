import { describe, expect, it, vi } from "vitest";
import { buildEscalationReply, loadActiveExperts } from "@/lib/messenger/escalation-reply";
import jaMessages from "@/messages/ja.json";
import tlMessages from "@/messages/tl.json";

// Messenger renders no cards, so the escalation the web shows as a card
// has to arrive as one message: lawyer-approved text, the experts, the
// support link. Before this, a Messenger user got only the text and had
// no way to reach anyone.

const EXPERTS = [
  {
    name: "山田 太郎",
    title: "行政書士",
    specialty_ja: "在留資格",
    specialty_en: "Residence status",
    specialty_tl: "Katayuan ng paninirahan",
    calendar_url: "https://example.test/book/yamada",
  },
  {
    name: "佐藤 花子",
    title: "弁護士",
    specialty_ja: "家族法",
    specialty_en: "Family law",
    specialty_tl: "Batas pampamilya",
    calendar_url: null,
  },
];

const TEXT = "ご質問の内容は個別の状況に応じた専門的な判断が必要なため、お答えすることができません。";

describe("buildEscalationReply", () => {
  it("keeps the escalation text first, then experts, then the support link", () => {
    const reply = buildEscalationReply(TEXT, EXPERTS, "ja", "https://app.example.test");

    expect(reply.indexOf(TEXT)).toBe(0);
    expect(reply).toContain(jaMessages.chat.ui.expertHeading);
    expect(reply).toContain("山田 太郎（行政書士／在留資格）");
    expect(reply).toContain("佐藤 花子（弁護士／家族法）");
    expect(reply).toContain(
      `${jaMessages.chat.ui.contactCta}: https://app.example.test/ja/contact`,
    );
    expect(reply.indexOf(jaMessages.chat.ui.expertHeading)).toBeLessThan(
      reply.indexOf(jaMessages.chat.ui.contactCta),
    );
  });

  it("shows a booking link only for the experts that have one", () => {
    const reply = buildEscalationReply(TEXT, EXPERTS, "ja", "https://app.example.test");
    expect(reply).toContain(`${jaMessages.chat.ui.expertSchedule}: https://example.test/book/yamada`);
    expect(reply.match(new RegExp(jaMessages.chat.ui.expertSchedule, "g"))).toHaveLength(1);
  });

  it("uses the reader's language for the labels and the specialty", () => {
    const reply = buildEscalationReply(TEXT, EXPERTS, "tl", "https://app.example.test");
    expect(reply).toContain(tlMessages.chat.ui.expertHeading);
    expect(reply).toContain("Katayuan ng paninirahan");
    expect(reply).toContain("/tl/contact");
  });

  it("falls back to the Japanese specialty when the translation is missing", () => {
    const reply = buildEscalationReply(
      TEXT,
      [{ ...EXPERTS[0]!, specialty_en: null }],
      "en",
      "https://app.example.test",
    );
    expect(reply).toContain("在留資格");
  });

  it("drops the expert section when nobody is active, keeping text and support link", () => {
    const reply = buildEscalationReply(TEXT, [], "ja", "https://app.example.test");
    expect(reply).toContain(TEXT);
    expect(reply).not.toContain(jaMessages.chat.ui.expertHeading);
    expect(reply).toContain("/ja/contact");
  });

  it("omits the support link when no app URL is configured", () => {
    const reply = buildEscalationReply(TEXT, [], "ja", "");
    expect(reply).toBe(TEXT);
  });
});

describe("loadActiveExperts", () => {
  function admin(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(async () => result);
    return { from: vi.fn(() => chain), chain } as const;
  }

  it("asks only for active experts, newest first", async () => {
    const a = admin({ data: EXPERTS, error: null });
    await expect(loadActiveExperts(a as never)).resolves.toHaveLength(2);
    expect(a.from).toHaveBeenCalledWith("experts");
    expect(a.chain.eq).toHaveBeenCalledWith("is_active", true);
    expect(a.chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns an empty list instead of throwing when the query fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadActiveExperts(admin({ data: null, error: { message: "db down" } }) as never),
    ).resolves.toEqual([]);
    spy.mockRestore();
  });
});
