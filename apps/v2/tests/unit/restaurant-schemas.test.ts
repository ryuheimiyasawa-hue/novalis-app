import { describe, expect, it } from "vitest";
import {
  RestaurantCreateSchema,
  RestaurantUpdateSchema,
  RestaurantListQuerySchema,
} from "@/lib/admin/schemas";

const base = {
  name: "Kanto Kainan",
  prefecture_code: "JP-13",
  city_name: "Shinjuku",
};

describe("RestaurantCreateSchema", () => {
  it("accepts the minimal required set (name / prefecture / city)", () => {
    expect(RestaurantCreateSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a full row", () => {
    const r = RestaurantCreateSchema.safeParse({
      ...base,
      address: "1-2-3 Kabukicho",
      lat: 35.69,
      lng: 139.7,
      cuisine_type: "Filipino",
      hours: "11:00-22:00",
      photo_url: "https://example.com/a.jpg",
      description_ja: "説明",
      description_en: "desc",
      description_tl: "paglalarawan",
      is_active: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(
      RestaurantCreateSchema.safeParse({
        prefecture_code: base.prefecture_code,
        city_name: base.city_name,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid prefecture code", () => {
    expect(
      RestaurantCreateSchema.safeParse({ ...base, prefecture_code: "13" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-https photo url", () => {
    expect(
      RestaurantCreateSchema.safeParse({
        ...base,
        photo_url: "http://example.com/a.jpg",
      }).success,
    ).toBe(false);
  });

  it("rejects an out-of-range latitude", () => {
    expect(
      RestaurantCreateSchema.safeParse({ ...base, lat: 999 }).success,
    ).toBe(false);
  });
});

describe("RestaurantUpdateSchema", () => {
  it("accepts a single-field patch", () => {
    expect(
      RestaurantUpdateSchema.safeParse({ is_active: false }).success,
    ).toBe(true);
  });

  it("allows nulling optional fields", () => {
    expect(
      RestaurantUpdateSchema.safeParse({ photo_url: null }).success,
    ).toBe(true);
  });
});

describe("RestaurantListQuerySchema", () => {
  it("accepts prefecture / cuisine / is_active filters", () => {
    expect(
      RestaurantListQuerySchema.safeParse({
        prefecture_code: "JP-27",
        cuisine_type: "Filipino",
        is_active: "true",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-boolean is_active", () => {
    expect(
      RestaurantListQuerySchema.safeParse({ is_active: "yes" }).success,
    ).toBe(false);
  });
});
