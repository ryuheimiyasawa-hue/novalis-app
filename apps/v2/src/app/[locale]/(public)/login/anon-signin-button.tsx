"use client";

import { useState } from "react";
import { CircleAlertIcon, FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// "Try without signing in" button that creates a Supabase anonymous
// auth user in one click. Designed for the beta-test phase where the
// goal is to let testers try the chat experience without spending
// minutes on FB OAuth / email confirmation / DNS verification / etc.
//
// Flow:
//   1. supabase.auth.signInAnonymously() — server creates an
//      auth.users row with is_anonymous=true and no email; the session
//      cookie is set automatically on the client.
//   2. ensure-profile is skipped here; the existing /api/auth/callback
//      route still handles the profile bootstrap for OAuth flows, and
//      the anon path triggers it on first authenticated request via the
//      session cookie. But to be explicit we call /api/auth/callback
//      with `code` empty + an anon=1 marker so the callback can route
//      to dashboard (anon users skip onboarding — handled in
//      ensureProfile by stamping onboarded_at automatically).
//
// Lifecycle: anon users live in auth.users until manually purged
//   (DELETE FROM auth.users WHERE is_anonymous=true) — Phase 2 may
//   add an automatic cleanup cron.
//
// Requires Supabase Pro plan with Anonymous Sign-In provider enabled
// in Dashboard → Authentication → Providers → Anonymous.

interface Props {
  locale: string;
  redirect: string | null;
  label: string;
  loadingLabel: string;
  errorLabel: string;
}

type State = "idle" | "loading" | "error";

export function AnonSignInButton({
  locale,
  redirect,
  label,
  loadingLabel,
  errorLabel,
}: Props) {
  const [state, setState] = useState<State>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function handleClick() {
    if (state === "loading") return;
    setState("loading");
    setErrorDetail(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInAnonymously();
      if (result.error) {
        console.error("[login-anon] signInAnonymously error:", result.error);
        setState("error");
        setErrorDetail(result.error.message);
        return;
      }
      // Session cookie set by the JS client. Hit our existing callback
      // route so ensureProfile runs server-side (anonymous user gets
      // onboarded_at stamped automatically) and the cookie is mirrored
      // into the server-side session before the destination page renders.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const callbackUrl = new URL("/api/auth/callback", appUrl);
      callbackUrl.searchParams.set("locale", locale);
      callbackUrl.searchParams.set("anon", "1");
      if (redirect) callbackUrl.searchParams.set("redirect", redirect);
      window.location.assign(callbackUrl.toString());
    } catch (err) {
      console.error("[login-anon] signInAnonymously threw:", err);
      setState("error");
      setErrorDetail(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-input bg-transparent px-6 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2Icon className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
        ) : (
          <FlaskConicalIcon className="size-4" strokeWidth={1.75} aria-hidden />
        )}
        {state === "loading" ? loadingLabel : label}
      </button>
      {state === "error" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            {errorLabel}
            {errorDetail ? ` (${errorDetail})` : ""}
          </span>
        </p>
      )}
    </div>
  );
}
