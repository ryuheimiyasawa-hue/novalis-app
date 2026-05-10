import { describe, expect, it } from "vitest";
import {
  PublicArticleListQuerySchema,
  PublicExpertListQuerySchema,
  PublicFaqListQuerySchema,
  escapeLike,
} from "@/lib/public/schemas";

describe("escapeLike", () => {
  it("escapes LIKE wildcards so user input cannot widen the search", () => {
    expect(escapeLike("100% free")).toBe("100\\% free");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("path\\to")).toBe("path\\\\to");
  });

  it("leaves benign input unchanged", () => {
    expect(escapeLike("ビザ")).toBe("ビザ");
    expect(escapeLike("hello world")).toBe("hello world");
  });
});

describe("PublicArticleListQuerySchema", () => {
  it("accepts no filters and applies defaults via the route", () => {
    const r = PublicArticleListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("coerces page and limit from strings (URL params)", () => {
    const r = PublicArticleListQuerySchema.safeParse({
      page: "3",
      limit: "10",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(3);
      expect(r.data.limit).toBe(10);
    }
  });

  it("rejects oversized limit (DoS prevention)", () => {
    expect(
      PublicArticleListQuerySchema.safeParse({ limit: "1000" }).success,
    ).toBe(false);
  });

  it("rejects page=0 and negative page", () => {
    expect(PublicArticleListQuerySchema.safeParse({ page: "0" }).success).toBe(
      false,
    );
    expect(PublicArticleListQuerySchema.safeParse({ page: "-1" }).success).toBe(
      false,
    );
  });

  it("rejects oversized search query", () => {
    expect(
      PublicArticleListQuerySchema.safeParse({ q: "x".repeat(101) }).success,
    ).toBe(false);
  });

  it("rejects bad category_slug and prefecture_code", () => {
    expect(
      PublicArticleListQuerySchema.safeParse({ category_slug: "BAD" }).success,
    ).toBe(false);
    expect(
      PublicArticleListQuerySchema.safeParse({ prefecture_code: "JP-ZZ" })
        .success,
    ).toBe(false);
  });
});

describe("PublicFaqListQuerySchema", () => {
  it("accepts no filters", () => {
    expect(PublicFaqListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects bad slug", () => {
    expect(
      PublicFaqListQuerySchema.safeParse({ category_slug: "Has Space" })
        .success,
    ).toBe(false);
  });
});

describe("PublicExpertListQuerySchema", () => {
  it("accepts no filters", () => {
    expect(PublicExpertListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid prefecture", () => {
    expect(
      PublicExpertListQuerySchema.safeParse({ prefecture_code: "JP-13" })
        .success,
    ).toBe(true);
  });

  it("rejects bogus prefecture", () => {
    expect(
      PublicExpertListQuerySchema.safeParse({ prefecture_code: "TOKYO" })
        .success,
    ).toBe(false);
  });
});
