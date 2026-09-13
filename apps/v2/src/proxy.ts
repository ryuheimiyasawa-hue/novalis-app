import createIntlMiddleware from "next-intl/middleware";
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { routing } from "@/lib/i18n/routing";
import { gateDecision } from "@/lib/legal/consent";
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
  // Facebook calls the Messenger webhook unauthenticated; it does its own
  // X-Hub-Signature-256 verification instead of relying on a session.
  "/api/messenger/webhook",
];

const LOCALE_RE = "(ja|en|tl)";
const PUBLIC_UI_PATTERNS: RegExp[] = [
  new RegExp(`^/${LOCALE_RE}/?$`),
  new RegExp(`^/${LOCALE_RE}/login(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/legal(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/articles(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/restaurants(/.*)?$`),
  // /contact embeds a Google Form for general inquiries. It needs to
  // be reachable by anonymous visitors (partner outreach links,
  // shared support URL, etc.) — gating it behind login would mean
  // only existing users can contact us, which defeats the purpose.
  // No app data leaks; the page is a thin iframe wrapper.
  new RegExp(`^/${LOCALE_RE}/contact(/.*)?$`),
  // /reset-password is reached via a Supabase recovery email link.
  // The user has a (recovery-scoped) session at that point but they
  // are not "logged in" in the onboarded-user sense. The page itself
  // gates on getUser() and redirects to /login when no session, so
  // it's safe to allow through here.
  new RegExp(`^/${LOCALE_RE}/reset-password(/.*)?$`),
];

// Authenticated paths that must remain reachable while onboarded_at IS NULL.
// /onboarding itself is the cure for the missing onboarded_at — redirecting
// it to itself would loop. /legal/* is in PUBLIC_UI_PATTERNS already.
// /consent is exempt for the same reason when the consented version is stale.
const GATE_EXEMPT_PATTERNS: RegExp[] = [
  new RegExp(`^/${LOCALE_RE}/onboarding(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/consent(/.*)?$`),
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
}
function isPublicUi(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_UI_PATTERNS.some((re) => re.test(pathname));
}
function isGateExempt(pathname: string): boolean {
  return GATE_EXEMPT_PATTERNS.some((re) => re.test(pathname));
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

function gateRedirect(req: NextRequest, page: "onboarding" | "consent"): NextResponse {
  const locale = pickLocale(req.nextUrl.pathname);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}/${page}`;
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

  // Onboarding + consent gate (admin pages included). /onboarding and /consent are exempt.
  if (!isGateExempt(pathname) && authed.userId && authed.supabase) {
    const gate = await checkGate(authed.supabase);
    if (gate !== "pass") return gateRedirect(req, gate);
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

async function checkGate(
  supabase: SupabaseClient<Database>,
): Promise<"pass" | "onboarding" | "consent"> {
  // Note: this is an extra DB round-trip on every authenticated UI request.
  // Optimization (e.g. encoding onboarded flag in a JWT claim or short-lived
  // cookie cache) is tracked as a Phase 2 task in tasks/lessons.md.
  // consent_gate_state() (migration 012) answers both questions in that one
  // round-trip; do not split it back into two queries (Lesson 7).
  const { data, error } = await supabase.rpc("consent_gate_state");
  if (error) {
    console.warn("[proxy] consent gate check failed:", error.message);
    // Fail open on transient DB errors so users are not blocked entirely.
    // This is a redirect for page loads only: /api/chat/send and the
    // Messenger webhook re-check consent and fail closed before Gemini.
    return "pass";
  }
  return gateDecision(data?.[0]);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
