import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { validateRedirect } from "@/lib/auth/redirect-validator";
import {
  LOGIN_FAILURE_COOKIE,
  buildFailureCookieOptions,
  parseFailureCount,
} from "@/lib/auth/login-failure-cookie";
import { routing } from "@/lib/i18n/routing";

function pickLocale(raw: string | null | undefined): string {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw;
  return routing.defaultLocale;
}

function loginRedirect(req: NextRequest, locale: string, error: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.search = "";
  url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  const next = parseFailureCount(req.cookies.get(LOGIN_FAILURE_COOKIE)?.value) + 1;
  response.cookies.set(LOGIN_FAILURE_COOKIE, String(next), buildFailureCookieOptions());
  return response;
}

function successResponse(target: URL): NextResponse {
  const response = NextResponse.redirect(target);
  response.cookies.delete(LOGIN_FAILURE_COOKIE);
  return response;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const oauthError = params.get("error");
  const locale = pickLocale(params.get("locale"));
  const requestedRedirect = params.get("redirect");

  // Facebook (or Supabase) returned an explicit error: user cancelled, denied, etc.
  if (oauthError) {
    if (requestedRedirect && !validateRedirect(requestedRedirect)) {
      console.warn("[oauth-callback] suspicious redirect dropped:", requestedRedirect);
    }
    return loginRedirect(req, locale, "fb_denied");
  }

  if (!code) {
    return loginRedirect(req, locale, "callback_failed");
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.warn("[oauth-callback] exchangeCodeForSession failed:", exchangeError.message);
    return loginRedirect(req, locale, "callback_failed");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return loginRedirect(req, locale, "callback_failed");
  }

  try {
    await ensureProfile(userData.user);
  } catch (err) {
    console.error("[oauth-callback] ensureProfile failed:", err);
    return loginRedirect(req, locale, "callback_failed");
  }

  const safeRedirect = validateRedirect(requestedRedirect);
  if (requestedRedirect && !safeRedirect) {
    console.warn("[oauth-callback] suspicious redirect dropped:", requestedRedirect);
  }

  if (safeRedirect) {
    return successResponse(new URL(safeRedirect, req.nextUrl.origin));
  }

  // No safe redirect: route by onboarding state.
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("onboarded_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  const path = profile?.onboarded_at ? `/${locale}/dashboard` : `/${locale}/onboarding`;
  return successResponse(new URL(path, req.nextUrl.origin));
}
