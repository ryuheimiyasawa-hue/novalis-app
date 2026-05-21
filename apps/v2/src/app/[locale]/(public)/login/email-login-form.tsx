"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Email magic link login. Sits beneath the Facebook button on the
// login page. Supabase Auth handles the email send (its built-in
// templated SMTP) and the link points back to our existing
// /api/auth/callback — same callback the Facebook OAuth flow uses,
// since exchangeCodeForSession accepts the magic-link code without
// any provider-specific branching.
//
// This is the fallback path for users who:
//   - cannot use the Facebook OAuth flow (in-app browser blocks it,
//     account locked, or simply no Facebook account)
//   - want a friction-free re-login (one click in their inbox)
//
// Trade-off: when a user signs up via magic link, FB-sourced
// display_name + avatar are unavailable. ensure-profile.ts handles
// the resulting null email/name with safe fallbacks already.

interface Props {
  locale: string;
  redirect: string | null;
  labels: {
    placeholder: string;
    button: string;
    sending: string;
    sent: string;
    failed: string;
  };
}

type State = "idle" | "sending" | "sent" | "error";

export function EmailLoginForm({ locale, redirect, labels }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || state === "sending") return;

    setState("sending");
    setErrorDetail(null);

    try {
      const supabase = createClient();
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const callbackUrl = new URL("/api/auth/callback", appUrl);
      callbackUrl.searchParams.set("locale", locale);
      if (redirect) callbackUrl.searchParams.set("redirect", redirect);

      const result = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          // shouldCreateUser=true is the default — a brand-new email
          // address gets a new auth user automatically on first link
          // click, then our /auth/callback runs ensureProfile() to
          // bootstrap the profiles row.
        },
      });

      if (result.error) {
        console.error("[login-email] signInWithOtp error:", result.error);
        setState("error");
        setErrorDetail(result.error.message);
        return;
      }
      setState("sent");
    } catch (err) {
      console.error("[login-email] signInWithOtp threw:", err);
      setState("error");
      setErrorDetail(err instanceof Error ? err.message : String(err));
    }
  }

  if (state === "sent") {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        {labels.sent}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={labels.placeholder}
        disabled={state === "sending"}
        className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={state === "sending" || email.trim().length === 0}
        className="w-full rounded-md bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
      >
        {state === "sending" ? labels.sending : labels.button}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {labels.failed}
          {errorDetail ? ` (${errorDetail})` : ""}
        </p>
      )}
    </form>
  );
}
