import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/lib/i18n/routing";
import { NextResponse, type NextRequest } from "next/server";

const intl = createIntlMiddleware(routing);

// Strict allowlist: only callback paths Supabase OAuth needs.
// Adding a path here removes its authentication check, so be conservative.
const PUBLIC_API_PATHS = ["/api/auth/callback"];

const LOCALE_RE = "(ja|en|tl)";
const PUBLIC_UI_PATTERNS: RegExp[] = [
  new RegExp(`^/${LOCALE_RE}/?$`),
  new RegExp(`^/${LOCALE_RE}/login(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/legal(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/articles(/.*)?$`),
  new RegExp(`^/${LOCALE_RE}/restaurants(/.*)?$`),
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicUi(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_UI_PATTERNS.some((re) => re.test(pathname));
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

function loginRedirect(req: NextRequest): NextResponse {
  const localeMatch = req.nextUrl.pathname.match(new RegExp(`^/${LOCALE_RE}(/|$)`));
  const locale = localeMatch?.[1] ?? routing.defaultLocale;
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const authed = await isAuthenticated(req);
    if (!authed.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      );
    }
    return authed.response;
  }

  if (pathname.startsWith("/admin")) {
    const authed = await isAuthenticated(req);
    if (!authed.ok) return loginRedirect(req);
    return authed.response;
  }

  if (isPublicUi(pathname)) {
    return intl(req);
  }

  const authed = await isAuthenticated(req);
  if (!authed.ok) return loginRedirect(req);
  return intl(req);
}

interface AuthCheckResult {
  ok: boolean;
  response: NextResponse;
}

async function isAuthenticated(req: NextRequest): Promise<AuthCheckResult> {
  let response = NextResponse.next({ request: req });
  const cookieDomain = getCookieDomain();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieDomain
        ? { domain: cookieDomain, sameSite: "lax", secure: true, httpOnly: true }
        : { sameSite: "lax", httpOnly: true },
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
  return { ok: !error && !!data.user, response };
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
