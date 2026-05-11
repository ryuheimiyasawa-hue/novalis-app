import { describe, expect, it } from "vitest";
import { chunkArticle, chunkFaq } from "@/lib/ai/chunking";

describe("chunkArticle", () => {
  const TITLE = "在留資格更新の基本手続き";

  it("returns one chunk for a short single paragraph", () => {
    const r = chunkArticle("申請は 3 か月前から可能です。", TITLE);
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe(`[${TITLE}]\n申請は 3 か月前から可能です。`);
    expect(r[0].index).toBe(0);
  });

  it("prefixes every chunk with the title", () => {
    const body = "短い段落 1。\n\n短い段落 2。\n\n短い段落 3。";
    const r = chunkArticle(body, TITLE);
    for (const c of r) expect(c.text.startsWith(`[${TITLE}]\n`)).toBe(true);
  });

  it("merges small paragraphs into one chunk while under target", () => {
    // Three 50-char paragraphs join into one chunk targeting 500 chars.
    const p = "あ".repeat(50);
    const body = `${p}\n\n${p}\n\n${p}`;
    const r = chunkArticle(body, TITLE, { targetChars: 500 });
    expect(r).toHaveLength(1);
  });

  it("starts a new chunk when adding the next paragraph would blow past target × 1.5", () => {
    const longish = "あ".repeat(400);
    const body = `${longish}\n\n${longish}\n\n${longish}`;
    const r = chunkArticle(body, TITLE, { targetChars: 500 });
    // 400 + 400 = 800 < 750 (target × 1.5)? 800 > 750 -> new chunk after first
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("splits an oversized paragraph by sentence with overlap", () => {
    // Build a single paragraph that exceeds maxParagraph and contains many sentences.
    const sentences = Array.from({ length: 8 }, (_, i) => `これは ${i + 1} 番目の文。`);
    const body = sentences.join("");
    expect(body.length).toBeGreaterThan(50);
    const r = chunkArticle(body, TITLE, {
      targetChars: 30,
      maxParagraphChars: 50,
      overlapChars: 10,
    });
    expect(r.length).toBeGreaterThan(1);
    // Index runs 0..n-1.
    expect(r.map((c) => c.index)).toEqual(r.map((_, i) => i));
    // Each chunk starts with the title prefix.
    for (const c of r) expect(c.text).toContain(`[${TITLE}]`);
  });

  it("preserves cross-chunk overlap when splitting an oversized paragraph", () => {
    // Two sentences in chunk 1 should appear at the start of chunk 2.
    const body =
      "文 A です。文 B です。文 C です。文 D です。文 E です。文 F です。文 G です。";
    const r = chunkArticle(body, TITLE, {
      targetChars: 20,
      maxParagraphChars: 30,
      overlapChars: 8,
    });
    // The last sentence of chunk[i] should usually be the first sentence
    // of chunk[i+1] (carry-over guarantees overlap >= overlapChars).
    if (r.length >= 2) {
      const c1 = r[0].text.replace(`[${TITLE}]\n`, "");
      const c2 = r[1].text.replace(`[${TITLE}]\n`, "");
      // Get the last sentence of c1 and check it's at the start of c2.
      const sentencesOfC1 = c1
        .split(/(?<=[。．！？!?])/u)
        .filter(Boolean);
      const lastOfC1 = sentencesOfC1[sentencesOfC1.length - 1]?.trim() ?? "";
      expect(c2.startsWith(lastOfC1)).toBe(true);
    }
  });

  it("trims blank-line spacing in source body", () => {
    const body = "段落 A。\n\n\n\n段落 B。";
    const r = chunkArticle(body, TITLE);
    expect(r).toHaveLength(1);
    expect(r[0].text).toContain("段落 A");
    expect(r[0].text).toContain("段落 B");
  });

  it("returns no chunks for an empty body (caller responsibility, not error)", () => {
    expect(chunkArticle("", TITLE)).toEqual([]);
    expect(chunkArticle("   \n\n  ", TITLE)).toEqual([]);
  });

  it("supports English source text", () => {
    const body =
      "Working visas in Japan are typically valid for one, three, or five years. The validity is decided by the immigration office based on the application.";
    const r = chunkArticle(body, "Working Visa Validity");
    expect(r).toHaveLength(1);
    expect(r[0].text).toContain("[Working Visa Validity]");
  });

  it("produces increasing 0-based index values", () => {
    const body = ["a".repeat(400), "b".repeat(400), "c".repeat(400)].join("\n\n");
    const r = chunkArticle(body, TITLE, { targetChars: 500 });
    for (let i = 0; i < r.length; i++) expect(r[i].index).toBe(i);
  });
});

describe("chunkFaq", () => {
  it("emits one Q+A chunk", () => {
    const r = chunkFaq(
      "健康保険に加入していないとどうなりますか？",
      "10 割負担になります。",
    );
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe(
      "Q: 健康保険に加入していないとどうなりますか？\nA: 10 割負担になります。",
    );
    expect(r[0].index).toBe(0);
  });

  it("trims surrounding whitespace from both question and answer", () => {
    const r = chunkFaq("  Q  ", "\n  A  \n");
    expect(r[0].text).toBe("Q: Q\nA: A");
  });
});
