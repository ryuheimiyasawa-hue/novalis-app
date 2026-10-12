import { describe, expect, it } from "vitest";
import { getCuisineLabel } from "@/lib/i18n/cuisines";

describe("getCuisineLabel", () => {
  it("keeps the Japanese value for Japanese readers", () => {
    expect(getCuisineLabel("フィリピン料理", "ja")).toBe("フィリピン料理");
  });

  it("translates the known values for English and Tagalog readers", () => {
    expect(getCuisineLabel("フィリピン料理", "en")).toBe("Filipino food");
    expect(getCuisineLabel("食材店", "tl")).toBe("Grocery");
  });

  it("shows an unknown value as entered instead of hiding it", () => {
    expect(getCuisineLabel("カフェ", "en")).toBe("カフェ");
  });
});
