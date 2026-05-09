// Returns the safe redirect path (relative, same-origin) or null if invalid.
// Strict allowlist: must be a single-slash relative path on the configured app
// origin. Rejects protocol-relative ("//evil.com"), backslash tricks ("/\\evil"),
// any scheme ("javascript:", "https://..."), and cross-origin absolute URLs.
//
// `appUrl` defaults to NEXT_PUBLIC_APP_URL; tests can pass it explicitly.
export function validateRedirect(
  redirect: string | null | undefined,
  appUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
): string | null {
  if (!redirect || typeof redirect !== "string") return null;

  if (!redirect.startsWith("/")) return null;
  if (redirect.startsWith("//")) return null;
  if (redirect.startsWith("/\\") || redirect.startsWith("\\")) return null;

  let baseOrigin: string;
  try {
    baseOrigin = new URL(appUrl).origin;
  } catch {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(redirect, appUrl);
  } catch {
    return null;
  }

  if (parsed.origin !== baseOrigin) return null;

  return parsed.pathname + parsed.search + parsed.hash;
}
