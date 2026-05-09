// Cookie holding the user's UI language preference.
// Read on the server (next/headers cookies()) so a Server Component can
// decide whether to render the WelcomeModal without a client-side effect.
// Set via document.cookie when the user picks a language.

export const PREFERRED_LANGUAGE_COOKIE = "preferredLanguage";
export const PREFERRED_LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const VALID = new Set(["ja", "en", "tl"]);

export function parsePreferredLanguage(
  raw: string | undefined,
): "ja" | "en" | "tl" | null {
  return raw && VALID.has(raw) ? (raw as "ja" | "en" | "tl") : null;
}

export function buildPreferredLanguageCookieAttributes(): string {
  return `path=/; max-age=${PREFERRED_LANGUAGE_COOKIE_MAX_AGE}; samesite=lax`;
}

// Browser-only writer. Kept outside React components so that
// react-hooks/immutability does not flag the document.cookie assignment
// (which is a setter on a global object, not local state).
export function setPreferredLanguageCookie(language: "ja" | "en" | "tl"): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PREFERRED_LANGUAGE_COOKIE}=${language}; ${buildPreferredLanguageCookieAttributes()}`;
}
