import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  generateLinkCode,
  isLinkCodeShape,
  linkCodeExpiry,
  normalizeLinkCode,
} from "@/lib/messenger/link-code";

describe("generateLinkCode", () => {
  it("produces codes of the declared length from the declared alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateLinkCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("excludes the ambiguous glyphs I, O, 0 and 1", () => {
    for (const ch of "IO01") expect(CODE_ALPHABET).not.toContain(ch);
  });

  it("does not repeat trivially (200 draws are not all identical)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateLinkCode());
    expect(seen.size).toBeGreaterThan(150);
  });

  it("always produces a value its own shape check accepts", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isLinkCodeShape(generateLinkCode())).toBe(true);
    }
  });
});

describe("normalizeLinkCode", () => {
  it("uppercases what the user typed", () => {
    expect(normalizeLinkCode("abcdef")).toBe("ABCDEF");
  });

  it("strips surrounding whitespace and inner separators", () => {
    expect(normalizeLinkCode("  AB-CD EF  ")).toBe("ABCDEF");
    expect(normalizeLinkCode("AB_CD.EF")).toBe("ABCDEF");
  });

  it("drops punctuation and non-latin characters", () => {
    expect(normalizeLinkCode("「ABCDEF」")).toBe("ABCDEF");
    expect(normalizeLinkCode("コード: ABCDEF")).toBe("ABCDEF");
  });

  it("leaves excluded glyphs in place so they fail to match cleanly", () => {
    // I/O are not in the alphabet; folding them could bind another user's code.
    expect(normalizeLinkCode("ABCDIO")).toBe("ABCDIO");
    expect(isLinkCodeShape(normalizeLinkCode("ABCDIO"))).toBe(false);
  });
});

describe("isLinkCodeShape", () => {
  it("accepts a well-formed code", () => {
    expect(isLinkCodeShape("ABC234")).toBe(true);
  });

  it("rejects wrong lengths", () => {
    expect(isLinkCodeShape("ABC23")).toBe(false);
    expect(isLinkCodeShape("ABC2345")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    expect(isLinkCodeShape("ABC01D")).toBe(false); // 0 and 1 excluded
    expect(isLinkCodeShape("abc234")).toBe(false); // lowercase must be normalised first
  });

  it("rejects ordinary chat messages", () => {
    for (const s of ["", "こんにちは", "hello", "在留カードの更新について"]) {
      expect(isLinkCodeShape(s)).toBe(false);
    }
  });
});

describe("linkCodeExpiry", () => {
  it("expires the declared number of minutes after issue", () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    expect(linkCodeExpiry(now).toISOString()).toBe("2026-07-31T00:10:00.000Z");
    expect(CODE_TTL_MINUTES).toBe(10);
  });

  it("returns a future timestamp by default", () => {
    expect(linkCodeExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});
