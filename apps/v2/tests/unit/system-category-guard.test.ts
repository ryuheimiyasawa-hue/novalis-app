import { describe, expect, it } from "vitest";
import {
  checkDeleteAllowed,
  checkSlugRenameAllowed,
} from "@/lib/admin/system-category-guard";

describe("checkDeleteAllowed", () => {
  it("blocks deletion of system categories", () => {
    expect(checkDeleteAllowed({ slug: "visa", is_system: true })).toEqual({
      ok: false,
      reason: "delete_blocked",
    });
  });

  it("allows deletion of admin-added categories", () => {
    expect(checkDeleteAllowed({ slug: "test-cat", is_system: false })).toEqual({
      ok: true,
    });
  });
});

describe("checkSlugRenameAllowed", () => {
  it("allows when no slug change is requested", () => {
    expect(
      checkSlugRenameAllowed({ slug: "visa", is_system: true }, undefined),
    ).toEqual({ ok: true });
  });

  it("allows a no-op rename even on system categories", () => {
    expect(
      checkSlugRenameAllowed({ slug: "visa", is_system: true }, "visa"),
    ).toEqual({ ok: true });
  });

  it("blocks renaming a system category slug", () => {
    expect(
      checkSlugRenameAllowed(
        { slug: "visa", is_system: true },
        "visa-residency",
      ),
    ).toEqual({ ok: false, reason: "slug_rename_blocked" });
  });

  it("allows renaming an admin-added category slug", () => {
    expect(
      checkSlugRenameAllowed(
        { slug: "test-cat", is_system: false },
        "test-cat-v2",
      ),
    ).toEqual({ ok: true });
  });
});
