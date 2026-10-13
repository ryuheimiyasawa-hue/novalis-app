import { describe, expect, it } from "vitest";
import { classifyOAuthError } from "@/lib/auth/oauth-error";

describe("classifyOAuthError", () => {
  it("treats a refusal on the Facebook screen as a cancel", () => {
    expect(classifyOAuthError("access_denied", "Permissions error")).toBe("fb_denied");
  });

  it("reports a Facebook account without an email address as such", () => {
    expect(
      classifyOAuthError("server_error", "Error getting user email from external provider"),
    ).toBe("fb_no_email");
  });

  it("reports anything else as a general failure, not a cancel", () => {
    expect(classifyOAuthError("server_error", "Unexpected failure")).toBe("fb_failed");
    expect(classifyOAuthError("temporarily_unavailable", null)).toBe("fb_failed");
  });
});
