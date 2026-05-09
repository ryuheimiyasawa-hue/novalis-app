import { describe, it, expect } from "vitest";
import { validateRedirect } from "@/lib/auth/redirect-validator";

const APP_URL = "https://app.novalis.ph";

describe("validateRedirect", () => {
  // ---------------------------------------------------------------
  // The 5 mandatory cases from W2 補足指示 A
  // ---------------------------------------------------------------
  it("allows a normal relative path on the app origin", () => {
    expect(validateRedirect("/ja/dashboard", APP_URL)).toBe("/ja/dashboard");
  });

  it("rejects an absolute URL pointing to a different origin", () => {
    expect(validateRedirect("https://evil.com", APP_URL)).toBeNull();
  });

  it("rejects a protocol-relative URL (//evil.com)", () => {
    expect(validateRedirect("//evil.com", APP_URL)).toBeNull();
  });

  it("rejects a javascript: pseudo-scheme", () => {
    expect(validateRedirect("javascript:alert(1)", APP_URL)).toBeNull();
  });

  it("rejects a backslash-prefixed path (/\\evil.com)", () => {
    expect(validateRedirect("/\\evil.com", APP_URL)).toBeNull();
  });

  // ---------------------------------------------------------------
  // Additional edge cases
  // ---------------------------------------------------------------
  it("returns null for null / undefined / empty", () => {
    expect(validateRedirect(null, APP_URL)).toBeNull();
    expect(validateRedirect(undefined, APP_URL)).toBeNull();
    expect(validateRedirect("", APP_URL)).toBeNull();
  });

  it("preserves query string and fragment on a same-origin path", () => {
    expect(
      validateRedirect("/en/articles/visa?utm=x#section", APP_URL),
    ).toBe("/en/articles/visa?utm=x#section");
  });

  it("rejects an absolute http URL on a different host", () => {
    expect(validateRedirect("http://evil.com/path", APP_URL)).toBeNull();
  });

  it("rejects a backslash-only prefix (\\evil.com)", () => {
    expect(validateRedirect("\\evil.com", APP_URL)).toBeNull();
  });

  it("rejects a URL with username in authority (//user@evil)", () => {
    // protocol-relative is already rejected; this is belt-and-braces
    expect(validateRedirect("//user@evil.com/path", APP_URL)).toBeNull();
  });

  it("rejects a non-string value defensively", () => {
    // @ts-expect-error intentional
    expect(validateRedirect(123, APP_URL)).toBeNull();
    // @ts-expect-error intentional
    expect(validateRedirect({}, APP_URL)).toBeNull();
  });

  it("works with localhost dev origin", () => {
    expect(validateRedirect("/ja/login", "http://localhost:3000")).toBe("/ja/login");
    expect(validateRedirect("https://app.novalis.ph/", "http://localhost:3000")).toBeNull();
  });
});
