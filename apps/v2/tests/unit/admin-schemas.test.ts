import { describe, expect, it } from "vitest";
import {
  ArticleCreateSchema,
  ArticleListQuerySchema,
  ArticleUpdateSchema,
  CategoryCreateSchema,
  CategoryUpdateSchema,
  ExpertCreateSchema,
  ExpertListQuerySchema,
  ExpertUpdateSchema,
  FaqCreateSchema,
  FaqListQuerySchema,
  FaqUpdateSchema,
  PrefectureCodeSchema,
  SlugSchema,
} from "@/lib/admin/schemas";

describe("SlugSchema", () => {
  it("accepts lowercase letters, digits, hyphens", () => {
    expect(SlugSchema.safeParse("visa").success).toBe(true);
    expect(SlugSchema.safeParse("social-ins").success).toBe(true);
    expect(SlugSchema.safeParse("a1b2-c3").success).toBe(true);
  });

  it("accepts underscores (legacy seeds: social_ins, admin_proc)", () => {
    expect(SlugSchema.safeParse("social_ins").success).toBe(true);
    expect(SlugSchema.safeParse("admin_proc").success).toBe(true);
    expect(SlugSchema.safeParse("a1_b2_c3").success).toBe(true);
  });

  it("accepts mixed _ and - within a slug", () => {
    expect(SlugSchema.safeParse("social_ins-2024").success).toBe(true);
  });

  it("rejects uppercase, leading or trailing separators", () => {
    expect(SlugSchema.safeParse("Visa").success).toBe(false);
    expect(SlugSchema.safeParse("-visa").success).toBe(false);
    expect(SlugSchema.safeParse("_visa").success).toBe(false);
    expect(SlugSchema.safeParse("visa-").success).toBe(false);
    expect(SlugSchema.safeParse("visa_").success).toBe(false);
  });

  it("rejects consecutive separators", () => {
    expect(SlugSchema.safeParse("visa--ins").success).toBe(false);
    expect(SlugSchema.safeParse("visa__ins").success).toBe(false);
    expect(SlugSchema.safeParse("visa-_ins").success).toBe(false);
    expect(SlugSchema.safeParse("visa_-ins").success).toBe(false);
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

describe("PrefectureCodeSchema", () => {
  it("accepts JP-NN", () => {
    expect(PrefectureCodeSchema.safeParse("JP-13").success).toBe(true);
    expect(PrefectureCodeSchema.safeParse("JP-01").success).toBe(true);
    expect(PrefectureCodeSchema.safeParse("JP-47").success).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(PrefectureCodeSchema.safeParse("13").success).toBe(false);
    expect(PrefectureCodeSchema.safeParse("JP13").success).toBe(false);
    expect(PrefectureCodeSchema.safeParse("jp-13").success).toBe(false);
    expect(PrefectureCodeSchema.safeParse("JP-1").success).toBe(false);
    expect(PrefectureCodeSchema.safeParse("US-CA").success).toBe(false);
  });
});

describe("ArticleCreateSchema", () => {
  const valid = {
    slug: "visa-update-2026",
    title_ja: "在留資格の更新方法",
    body_ja: "在留期限の3か月前から申請できます。",
  };

  it("accepts the minimum required fields", () => {
    expect(ArticleCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults status omitted (route side stamps 'draft')", () => {
    const r = ArticleCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBeUndefined();
  });

  it("accepts a published status with prefecture/city scope", () => {
    expect(
      ArticleCreateSchema.safeParse({
        ...valid,
        status: "published",
        prefecture_code: "JP-13",
        city_name: "渋谷区",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(
      ArticleCreateSchema.safeParse({ ...valid, status: "deleted" }).success,
    ).toBe(false);
  });

  it("rejects empty body_ja and oversized body", () => {
    expect(
      ArticleCreateSchema.safeParse({ ...valid, body_ja: "" }).success,
    ).toBe(false);
    expect(
      ArticleCreateSchema.safeParse({
        ...valid,
        body_ja: "x".repeat(50_001),
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid category UUID", () => {
    expect(
      ArticleCreateSchema.safeParse({ ...valid, category_id: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("accepts null category_id", () => {
    expect(
      ArticleCreateSchema.safeParse({ ...valid, category_id: null }).success,
    ).toBe(true);
  });
});

describe("ArticleUpdateSchema", () => {
  it("accepts a status-only update", () => {
    expect(ArticleUpdateSchema.safeParse({ status: "published" }).success).toBe(
      true,
    );
  });

  it("accepts an empty object (caller rejects with 400)", () => {
    expect(ArticleUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejects empty title when present", () => {
    expect(ArticleUpdateSchema.safeParse({ title_ja: "" }).success).toBe(false);
  });
});

describe("ArticleListQuerySchema", () => {
  it("accepts no filters", () => {
    expect(ArticleListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects bogus status", () => {
    expect(
      ArticleListQuerySchema.safeParse({ status: "deleted" }).success,
    ).toBe(false);
  });

  it("rejects bogus category_id", () => {
    expect(
      ArticleListQuerySchema.safeParse({ category_id: "not-uuid" }).success,
    ).toBe(false);
  });
});

describe("FaqCreateSchema", () => {
  const valid = {
    question_ja: "在留期限を過ぎたらどうなりますか？",
    answer_ja: "速やかに入管に相談してください。",
  };

  it("accepts the minimum required fields", () => {
    expect(FaqCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts published with sort order and prefecture", () => {
    expect(
      FaqCreateSchema.safeParse({
        ...valid,
        is_published: true,
        sort_order: 5,
        prefecture_code: "JP-13",
      }).success,
    ).toBe(true);
  });

  it("rejects empty question_ja or answer_ja", () => {
    expect(
      FaqCreateSchema.safeParse({ ...valid, question_ja: "" }).success,
    ).toBe(false);
    expect(
      FaqCreateSchema.safeParse({ ...valid, answer_ja: "" }).success,
    ).toBe(false);
  });

  it("rejects oversized answer", () => {
    expect(
      FaqCreateSchema.safeParse({
        ...valid,
        answer_ja: "x".repeat(10_001),
      }).success,
    ).toBe(false);
  });
});

describe("FaqUpdateSchema", () => {
  it("accepts is_published-only toggle", () => {
    expect(FaqUpdateSchema.safeParse({ is_published: true }).success).toBe(true);
  });

  it("rejects empty question when present", () => {
    expect(FaqUpdateSchema.safeParse({ question_ja: "" }).success).toBe(false);
  });
});

describe("FaqListQuerySchema", () => {
  it("accepts is_published as 'true' / 'false' strings", () => {
    expect(FaqListQuerySchema.safeParse({ is_published: "true" }).success).toBe(
      true,
    );
    expect(
      FaqListQuerySchema.safeParse({ is_published: "false" }).success,
    ).toBe(true);
  });

  it("rejects boolean primitives (URL params are strings)", () => {
    expect(FaqListQuerySchema.safeParse({ is_published: true }).success).toBe(
      false,
    );
  });

  it("rejects bogus category_id", () => {
    expect(
      FaqListQuerySchema.safeParse({ category_id: "not-uuid" }).success,
    ).toBe(false);
  });
});

describe("ExpertCreateSchema", () => {
  const valid = { name: "山田 太郎", title: "弁護士" };

  it("accepts the minimum required fields", () => {
    expect(ExpertCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts https calendar/avatar URLs", () => {
    expect(
      ExpertCreateSchema.safeParse({
        ...valid,
        calendar_url: "https://calendly.com/tanaka",
        avatar_url: "https://cdn.example.com/a.png",
      }).success,
    ).toBe(true);
  });

  it("rejects http (non-TLS) URLs", () => {
    expect(
      ExpertCreateSchema.safeParse({
        ...valid,
        calendar_url: "http://calendly.com/tanaka",
      }).success,
    ).toBe(false);
  });

  it("rejects javascript: / data: URLs (XSS via href)", () => {
    expect(
      ExpertCreateSchema.safeParse({
        ...valid,
        calendar_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      ExpertCreateSchema.safeParse({
        ...valid,
        avatar_url: "data:image/png;base64,AAAA",
      }).success,
    ).toBe(false);
  });

  it("rejects empty name or title", () => {
    expect(
      ExpertCreateSchema.safeParse({ ...valid, name: "" }).success,
    ).toBe(false);
    expect(
      ExpertCreateSchema.safeParse({ ...valid, title: "" }).success,
    ).toBe(false);
  });

  it("rejects oversized bio", () => {
    expect(
      ExpertCreateSchema.safeParse({
        ...valid,
        bio_ja: "x".repeat(5_001),
      }).success,
    ).toBe(false);
  });
});

describe("ExpertUpdateSchema", () => {
  it("accepts is_active toggle alone", () => {
    expect(ExpertUpdateSchema.safeParse({ is_active: false }).success).toBe(
      true,
    );
  });

  it("rejects empty name when present", () => {
    expect(ExpertUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("ExpertListQuerySchema", () => {
  it("accepts no filters", () => {
    expect(ExpertListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects bogus prefecture", () => {
    expect(
      ExpertListQuerySchema.safeParse({ prefecture_code: "JP-XX" }).success,
    ).toBe(false);
  });

  it("rejects bogus is_active value", () => {
    expect(
      ExpertListQuerySchema.safeParse({ is_active: "yes" }).success,
    ).toBe(false);
  });
});
