import { describe, expect, it } from "vitest";
import { isActiveAdminNav } from "@/lib/admin/nav-active";

describe("isActiveAdminNav", () => {
  describe("/admin (top dashboard)", () => {
    it("matches only the exact /admin path", () => {
      expect(isActiveAdminNav("/admin", "/admin")).toBe(true);
    });

    it("does not match section pages", () => {
      expect(isActiveAdminNav("/admin/articles", "/admin")).toBe(false);
      expect(isActiveAdminNav("/admin/categories/new", "/admin")).toBe(false);
    });
  });

  describe("section items", () => {
    it("matches the exact section path", () => {
      expect(isActiveAdminNav("/admin/articles", "/admin/articles")).toBe(true);
    });

    it("matches nested paths under the section", () => {
      expect(isActiveAdminNav("/admin/articles/new", "/admin/articles")).toBe(
        true,
      );
      expect(
        isActiveAdminNav("/admin/articles/abc-123/edit", "/admin/articles"),
      ).toBe(true);
    });

    it("does not match sibling sections that share a prefix", () => {
      // /admin/article should NOT match /admin/articles even though they
      // share a prefix — the path-segment boundary protects against this.
      expect(isActiveAdminNav("/admin/article", "/admin/articles")).toBe(false);
      expect(
        isActiveAdminNav("/admin/articles-archive", "/admin/articles"),
      ).toBe(false);
    });

    it("does not match unrelated sections", () => {
      expect(isActiveAdminNav("/admin/faqs", "/admin/articles")).toBe(false);
      expect(isActiveAdminNav("/admin", "/admin/articles")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty pathname gracefully", () => {
      expect(isActiveAdminNav("", "/admin")).toBe(false);
      expect(isActiveAdminNav("", "/admin/articles")).toBe(false);
    });

    it("does not match paths outside /admin", () => {
      expect(isActiveAdminNav("/ja/dashboard", "/admin")).toBe(false);
      expect(isActiveAdminNav("/ja/dashboard", "/admin/articles")).toBe(false);
    });
  });
});
