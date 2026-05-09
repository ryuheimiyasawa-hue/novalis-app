// Server-side helpers for the login-failure counter cookie.
// HttpOnly cookie scoped to /api/auth/callback and /[locale]/login;
// callback writes, login reads, success path clears.

export const LOGIN_FAILURE_COOKIE = "lf_count";
export const LOGIN_FAILURE_MAX_AGE_SECONDS = 60 * 60; // 1 hour

export function parseFailureCount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function buildFailureCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: LOGIN_FAILURE_MAX_AGE_SECONDS,
    path: "/",
  };
}
