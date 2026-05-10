import createIntlMiddleware from "next-intl/middleware";
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { routing } from "@/lib/i18n/routing";
import { NextResponse, type NextRequest } from "next/server";

const intl = createIntlMiddleware(routing);

// Strict allowlist: only callback paths Supabase OAuth needs and the
// read-only public content endpoints. Each entry is matched as a path
// prefix (so /api/articles also covers /api/articles/[slug]).
// Adding a path here removes its authentication check, so be conservative.
const PUBLIC_API_PATHS = [
  "/api/auth/callback",
  "/api/categories",
  "/api/articles",
  "/api/faqs",
  "/api/experts",
];

const LOCALE_RE = "(ja|en|tl)";
const PUBLIC_UI_PATTERNS: RegExp[] = [
  new RegExp(`^/${LOCALE_RE}/?$`),
  new RegExp(`^/${LOCALE_RE}/login(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/legal(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/articles(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/restaurants(/.*)?$`),
];

// Authenticated paths that must remain reachable while onboarded_at IS NULL.
// /onboarding itself is the cure for the missing onboarded_at — redirecting
// it to itself would loop. /legal/* is in PUBLIC_UI_PATTERNS already.
const ONBOARDING_EXEMPT_PATTERNS: RegExp[] = [
  new RegExp(`^/${LOCALE_RE}/onboarding(/.*)?$`),
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
}
function isPublicUi(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_UI_PATTERNS.some((re) => re.test(pathname));
}
function isOnboardingExempt(pathname: string): boolean {
  return ONBOARDING_EXEMPT_PATTERNS.some((re) => re.test(pathname));
}

function getCookieDomain(): string | undefined {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" ? undefined : host;
  } catch {
    return undefined;
  }
}

function pickLocale(pathname: string): string {
  const m = pathname.match(new RegExp(`^/${LOCALE_RE}(/|$)`));
  return m?.[1] ?? routing.defaultLocale;
}

function loginRedirect(req: NextRequest): NextResponse {
  const locale = pickLocale(req.nextUrl.pathname);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function onboardingRedirect(req: NextRequest): NextResponse {
  const locale = pickLocale(req.nextUrl.pathname);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}/onboarding`;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicApi(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const authed = await checkAuth(req);
    if (!authed.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      );
    }
    return authed.response;
  }

  if (pathname.startsWith("/admin")) {
    const authed = await checkAuth(req);
    if (!authed.ok) return loginRedirect(req);
    // Admin paths additionally require onboarded — handled below
  }

  if (isPublicUi(pathname)) return intl(req);

  const authed = await checkAuth(req);
  if (!authed.ok) return loginRedirect(req);

  // Onboarded check: skip for /onboarding (exempt) and admin? Admin requires onboarded.
  if (!isOnboardingExempt(pathname) && authed.userId && authed.supabase) {
    const onboarded = await checkOnboarded(authed.supabase, authed.userId);
    if (!onboarded) return onboardingRedirect(req);
  }

  if (pathname.startsWith("/admin")) return authed.response;
  return intl(req);
}

interface AuthCheckResult {
  ok: boolean;
  userId?: string;
  supabase?: SupabaseClient<Database>;
  response: NextResponse;
}

async function checkAuth(req: NextRequest): Promise<AuthCheckResult> {
  let response = NextResponse.next({ request: req });
  const cookieDomain = getCookieDomain();
  const cookieOptions: CookieOptionsWithName = cookieDomain
    ? { domain: cookieDomain, sameSite: "lax", secure: true, httpOnly: true }
    : { sameSite: "lax", httpOnly: true };

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  return {
    ok: !error && !!data.user,
    userId: data.user?.id,
    supabase,
    response,
  };
}

async function checkOnboarded(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  // Note: this is an extra DB round-trip on every authenticated UI request.
  // Optimization (e.g. encoding onboarded flag in a JWT claim or short-lived
  // cookie cache) is tracked as a Phase 2 task in tasks/lessons.md.
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[proxy] onboarded check failed:", error.message);
    // Fail open on transient DB errors so users are not blocked entirely;
    // the (authed) layout's getUser() call would catch a real auth issue.
    return true;
  }
  return !!data?.onboarded_at;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
