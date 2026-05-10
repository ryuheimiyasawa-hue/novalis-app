import { describe, expect, it } from "vitest";
import {
  CategoryCreateSchema,
  CategoryUpdateSchema,
  SlugSchema,
} from "@/lib/admin/schemas";

describe("SlugSchema", () => {
  it("accepts lowercase letters, digits, hyphens", () => {
    expect(SlugSchema.safeParse("visa").success).toBe(true);
    expect(SlugSchema.safeParse("social-ins").success).toBe(true);
    expect(SlugSchema.safeParse("a1b2-c3").success).toBe(true);
  });

  it("rejects uppercase, underscores, leading or trailing hyphens", () => {
    expect(SlugSchema.safeParse("Visa").success).toBe(false);
    expect(SlugSchema.safeParse("social_ins").success).toBe(false);
    expect(SlugSchema.safeParse("-visa").success).toBe(false);
    expect(SlugSchema.safeParse("visa-").success).toBe(false);
    expect(SlugSchema.safeParse("visa--ins").success).toBe(false);
  });

  it("rejects empty and over-length input", () => {
    expect(SlugSchema.safeParse("").success).toBe(false);
    expect(SlugSchema.safeParse("a".repeat(81)).success).toBe(false);
  });
});

describe("CategoryCreateSchema", () => {
  const valid = {
    slug: "visa",
    name_ja: "在留資格・ビザ",
    name_en: "Visa & Residency",
    name_tl: "Visa at Residency",
  };

  it("accepts the minimum required fields", () => {
    expect(CategoryCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional icon and sort_order", () => {
    const r = CategoryCreateSchema.safeParse({
      ...valid,
      icon: "passport",
      sort_order: 5,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing required name", () => {
    const r = CategoryCreateSchema.safeParse({ ...valid, name_ja: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid slug", () => {
    const r = CategoryCreateSchema.safeParse({ ...valid, slug: "INVALID" });
    expect(r.success).toBe(false);
  });

  it("rejects negative or oversized sort_order", () => {
    expect(
      CategoryCreateSchema.safeParse({ ...valid, sort_order: -1 }).success,
    ).toBe(false);
    expect(
      CategoryCreateSchema.safeParse({ ...valid, sort_order: 10000 }).success,
    ).toBe(false);
  });
});

describe("CategoryUpdateSchema", () => {
  it("accepts an empty object (caller checks emptiness for 400)", () => {
    expect(CategoryUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a single field update", () => {
    expect(
      CategoryUpdateSchema.safeParse({ name_ja: "ビザ更新" }).success,
    ).toBe(true);
  });

  it("rejects an invalid slug update", () => {
    expect(
      CategoryUpdateSchema.safeParse({ slug: "Has Space" }).success,
    ).toBe(false);
  });
});
