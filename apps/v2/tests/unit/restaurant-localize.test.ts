import { describe, expect, it } from "vitest";
import { pickRestaurantCity, pickRestaurantName } from "@/lib/restaurants/localize";

const ROW = {
  name: "カリエンテ・マニラ",
  name_en: "Caliente Manila",
  city_name: "新宿区",
  city_name_en: "Shinjuku",
};

describe("restaurant name and city per language", () => {
  it("keeps the Japanese values for Japanese readers", () => {
    expect(pickRestaurantName(ROW, "ja")).toBe("カリエンテ・マニラ");
    expect(pickRestaurantCity(ROW, "ja")).toBe("新宿区");
  });

  it("uses the English spelling for English and Tagalog readers", () => {
    expect(pickRestaurantName(ROW, "en")).toBe("Caliente Manila");
    expect(pickRestaurantCity(ROW, "tl")).toBe("Shinjuku");
  });

  it("falls back to Japanese when no English spelling was entered", () => {
    expect(pickRestaurantName({ name: "マニラ食堂", name_en: null }, "en")).toBe("マニラ食堂");
    expect(pickRestaurantCity({ city_name: "港区", city_name_en: "  " }, "tl")).toBe("港区");
  });
});
