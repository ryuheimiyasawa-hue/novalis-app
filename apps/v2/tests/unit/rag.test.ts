import { describe, expect, it } from "vitest";
import {
  buildCitations,
  buildContextText,
  type Citation,
  type RagChunkRow,
} from "@/lib/ai/rag";

const joined = {
  articles: new Map([
    [
      "art-1",
      {
        slug: "visa-renewal-basics",
        title_ja: "在留資格更新の基本手続き",
        title_en: "Visa Renewal Basics",
        title_tl: null,
      },
    ],
    [
      "art-2",
      {
        slug: "health-insurance-basics",
        title_ja: "健康保険への加入と保険料の基本",
        title_en: null,
        title_tl: null,
      },
    ],
  ]),
  faqs: new Map([
    [
      "faq-1",
      {
        question_ja: "在留期限を過ぎてしまったらどうなりますか？",
        question_en: null,
        question_tl: null,
      },
    ],
  ]),
};

const rows: RagChunkRow[] = [
  {
    source_type: "article",
    source_id: "art-1",
    language: "ja",
    chunk_text:
      "[在留資格更新の基本手続き]\n日本に中長期で滞在する外国人は、在留期間の満了前に「在留期間更新許可申請」を行う必要があります。",
    similarity: 0.82,
  },
  {
    source_type: "faq",
    source_id: "faq-1",
    language: "ja",
    chunk_text:
      "Q: 在留期限を過ぎてしまったらどうなりますか？\nA: 在留期限を 1 日でも過ぎると「不法残留（オーバーステイ）」となり、原則として退去強制の対象となります。",
    similarity: 0.78,
  },
];

describe("buildCitations", () => {
  it("resolves article slug and title in the requested locale (ja)", () => {
    const c = buildCitations(rows.slice(0, 1), joined, "ja");
    expect(c[0]).toMatchObject({
      source_type: "article",
      source_id: "art-1",
      slug: "visa-renewal-basics",
      title: "在留資格更新の基本手続き",
      language: "ja",
      similarity: 0.82,
    });
  });

  it("falls back to ja title when requested locale isn't translated", () => {
    // art-1 has en, but art-2 has only ja
    const c = buildCitations(
      [
        {
          ...rows[0],
          source_id: "art-2",
          chunk_text: "[健康保険への加入と保険料の基本]\n会社員は協会けんぽに加入。",
        },
      ],
      joined,
      "en",
    );
    expect(c[0].title).toBe("健康保険への加入と保険料の基本");
  });

  it("uses en title when the article has it and locale is en", () => {
    const c = buildCitations(rows.slice(0, 1), joined, "en");
    expect(c[0].title).toBe("Visa Renewal Basics");
  });

  it("uses the FAQ question_ja as title for faq rows", () => {
    const c = buildCitations([rows[1]], joined, "ja");
    expect(c[0].source_type).toBe("faq");
    expect(c[0].slug).toBeNull();
    expect(c[0].title).toBe("在留期限を過ぎてしまったらどうなりますか？");
  });

  it("strips the [Title] prefix from the snippet", () => {
    const c = buildCitations(rows.slice(0, 1), joined, "ja");
    expect(c[0].snippet.startsWith("[")).toBe(false);
    expect(c[0].snippet).toContain("日本に中長期で滞在する外国人");
  });

  it("truncates long snippets with ellipsis", () => {
    const long = "あ".repeat(300);
    const c = buildCitations(
      [{ ...rows[0], chunk_text: `[t]\n${long}` }],
      joined,
      "ja",
    );
    expect(c[0].snippet.length).toBeLessThanOrEqual(150);
    expect(c[0].snippet.endsWith("…")).toBe(true);
  });

  it("returns '(unknown article)' when the join is missing", () => {
    const c = buildCitations(
      [{ ...rows[0], source_id: "missing-id" }],
      joined,
      "ja",
    );
    expect(c[0].title).toBe("(unknown article)");
    expect(c[0].slug).toBeNull();
  });
});

describe("buildContextText", () => {
  it("returns empty string for no citations", () => {
    expect(buildContextText([])).toBe("");
  });

  it("wraps citations in REFERENCE_BEGIN / REFERENCE_END sentinels", () => {
    const citations: Citation[] = buildCitations(rows, joined, "ja");
    const text = buildContextText(citations);
    expect(text.startsWith("REFERENCE_BEGIN")).toBe(true);
    expect(text.endsWith("REFERENCE_END")).toBe(true);
  });

  it("numbers each citation starting at #1", () => {
    const citations = buildCitations(rows, joined, "ja");
    const text = buildContextText(citations);
    expect(text).toContain("[#1 src=article");
    expect(text).toContain("[#2 src=faq");
  });

  it("includes the slug for articles but not for faqs", () => {
    const citations = buildCitations(rows, joined, "ja");
    const text = buildContextText(citations);
    expect(text).toMatch(/\[#1 src=article slug=visa-renewal-basics lang=ja\]/);
    expect(text).toMatch(/\[#2 src=faq lang=ja\]/);
    expect(text).not.toMatch(/\[#2 src=faq slug=/);
  });

  it("includes the snippet body verbatim", () => {
    const citations = buildCitations(rows.slice(0, 1), joined, "ja");
    const text = buildContextText(citations);
    expect(text).toContain("日本に中長期で滞在する外国人");
  });
});
