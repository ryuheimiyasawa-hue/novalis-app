import { describe, expect, it } from "vitest";
import {
  displayablePhotoUrl,
  isSampleRestaurant,
  showcaseRestaurants,
} from "@/lib/restaurants/photo";

describe("restaurant photo shown on cards", () => {
  it("keeps a real shop photo", () => {
    expect(displayablePhotoUrl("https://example.com/shop.jpg")).toBe("https://example.com/shop.jpg");
  });

  it("hides the placeholder stock photos the seed shops use", () => {
    expect(displayablePhotoUrl("https://picsum.photos/seed/novalisr5/600/400")).toBeNull();
    expect(displayablePhotoUrl("https://fastly.picsum.photos/id/1/600/400.jpg")).toBeNull();
  });

  it("treats blank, relative and non-http values as no photo", () => {
    expect(displayablePhotoUrl(null)).toBeNull();
    expect(displayablePhotoUrl("   ")).toBeNull();
    expect(displayablePhotoUrl("/images/shop.jpg")).toBeNull();
    expect(displayablePhotoUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("sample shops are kept off the public lists", () => {
  it("spots the seed shops by their (Sample) / （サンプル） suffix", () => {
    expect(isSampleRestaurant({ name: "Kapaya Mart Kawaguchi (Sample)" })).toBe(true);
    expect(isSampleRestaurant({ name: "カパヤマート川口（サンプル）" })).toBe(true);
    expect(isSampleRestaurant({ name: "カパヤマート", name_en: "Kapaya Mart (sample)" })).toBe(true);
    expect(isSampleRestaurant({ name: "Kapaya Mart Kawaguchi" })).toBe(false);
    expect(isSampleRestaurant({ name: "Sample Street Grill" })).toBe(false);
  });

  it("showcases only real shops that have a photo to show", () => {
    const rows = [
      { name: "Real Grill", name_en: null, photo_url: "https://example.com/a.jpg" },
      { name: "No Photo Mart", name_en: null, photo_url: null },
      { name: "Stock Photo Eatery", name_en: null, photo_url: "https://picsum.photos/600/400" },
      { name: "Demo (Sample)", name_en: null, photo_url: "https://example.com/b.jpg" },
    ];
    expect(showcaseRestaurants(rows).map((r) => r.name)).toEqual(["Real Grill"]);
    expect(showcaseRestaurants(rows.slice(1))).toEqual([]);
  });
});
