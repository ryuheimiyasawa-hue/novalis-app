import { describe, it, expect } from "vitest";
import {
  PREFECTURES,
  PREFECTURE_CODE_RE,
  getPrefectureLabel,
} from "@/lib/i18n/prefectures";

describe("prefectures", () => {
  it("contains exactly 47 entries", () => {
    expect(PREFECTURES).toHaveLength(47);
  });

  it("each code matches JP-NN format", () => {
    for (const p of PREFECTURES) {
      expect(p.code).toMatch(PREFECTURE_CODE_RE);
    }
  });

  it("codes are unique", () => {
    const codes = new Set(PREFECTURES.map((p) => p.code));
    expect(codes.size).toBe(PREFECTURES.length);
  });

  it("getPrefectureLabel returns the ja label", () => {
    expect(getPrefectureLabel("JP-13", "ja")).toBe("東京都");
  });

  it("getPrefectureLabel returns the en label", () => {
    expect(getPrefectureLabel("JP-13", "en")).toBe("Tokyo");
  });

  it("getPrefectureLabel falls back to en for tl", () => {
    expect(getPrefectureLabel("JP-27", "tl")).toBe("Osaka");
  });

  it("getPrefectureLabel returns null for an unknown code", () => {
    expect(getPrefectureLabel("JP-99", "ja")).toBeNull();
  });
});
