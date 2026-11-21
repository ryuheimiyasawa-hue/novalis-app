import { describe, expect, it } from "vitest";
import { displayablePhotoUrl } from "@/lib/restaurants/photo";

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
