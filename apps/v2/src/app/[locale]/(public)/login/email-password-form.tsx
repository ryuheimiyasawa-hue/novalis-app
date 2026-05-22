"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Email + password authentication. Replaces the magic-link form.
// Three actions on one screen:
//   - Sign in   (supabase.auth.signInWithPassword)
//   - Sign up   (supabase.auth.signUp)
//   - Forgot password (supabase.auth.resetPasswordForEmail)
//
// All three share the same email field; sign up / sign in share the
// password field; forgot password skips the password field. Two-buttons
// pattern (Sign in / Sign up) keeps the UI dense; the forgot-password
// link sits below them.
//
// Sign-up response handling:
//   - Supabase Email-confirm ON: result.session is null; we show a
//     "確認メール送信しました" message and let the user click the link.
//     The callback then redirects to dashboard/onboarding.
//   - Supabase Email-confirm OFF: result.session is non-null; we
//     redirect immediately via window.location to /auth/callback so
//     ensureProfile fires and the session cookie is set.
//
// The form chooses behaviour from the response, so the code works
// against either Supabase setting without modification.

interface Props {
  locale: string;
  redirect: string | null;
  labels: {
    emailPlaceholder: string;
    passwordPlaceholder: string;
    signIn: string;
    signUp: string;
    signingIn: string;
    signingUp: string;
    signInFailed: string;
    signUpFailed: string;
    signUpAlreadyRegistered: string;
    signUpEmailSent: string;
    signUpInstantSuccess: string;
    passwordTooShort: string;
    forgotPassword: string;
    resetEmailSent: string;
    resetFailed: string;
    resetTitle: string;
    resetSubmit: string;
    resetCancel: string;
  };
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; action: "signin" | "signup" | "reset" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const MIN_PASSWORD_LENGTH = 6;

export function EmailPasswordForm({ locale, redirect, labels }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"auth" | "reset">("auth");
  const [state, setState] = useState<State>({ kind: "idle" });

  function buildCallbackUrl(): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const callbackUrl = new URL("/api/auth/callback", appUrl);
    callbackUrl.searchParams.set("locale", locale);
    if (redirect) callbackUrl.searchParams.set("redirect", redirect);
    return callbackUrl.toString();
  }

  async function handleSignIn() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    setState({ kind: "loading", action: "signin" });
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (result.error) {
        console.warn("[login-email] signInWithPassword:", result.error.message);
        setState({ kind: "error", message: labels.signInFailed });
        return;
      }
      // Session established. Hit our callback so ensureProfile runs and
      // the user is routed by onboarding state. Using window.location
      // (not router.push) so the Set-Cookie from the callback handler
      // actually lands before the destination page renders.
      window.location.assign(buildCallbackUrl());
    } catch (err) {
      console.error("[login-email] signInWithPassword threw:", err);
      setState({ kind: "error", message: labels.signInFailed });
    }
  }

  async function handleSignUp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setState({ kind: "error", message: labels.passwordTooShort });
      return;
    }
    setState({ kind: "loading", action: "signup" });
    try {
      const supabase = createClient();
      const result = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: buildCallbackUrl() },
      });
      if (result.error) {
        console.warn("[login-email] signUp:", result.error.message);
        // Supabase phrases "already registered" several ways across
        // versions: "User already registered", "Email address ... is
        // already registered", or error code email_exists. Treat any
        // of them as the same dedicated message so the user gets a
        // clear "use sign-in instead" hint rather than the generic
        // failure copy.
        const raw = result.error.message.toLowerCase();
        const alreadyRegistered =
          raw.includes("already registered") ||
          raw.includes("already exists") ||
          raw.includes("already in use") ||
          // Newer GoTrue error codes carry email_exists / user_already_exists
          result.error.code === "email_exists" ||
          result.error.code === "user_already_exists";
        setState({
          kind: "error",
          message: alreadyRegistered
            ? labels.signUpAlreadyRegistered
            : labels.signUpFailed,
        });
        return;
      }
      if (result.data.session) {
        // Email confirmation is OFF — user is logged in immediately.
        window.location.assign(buildCallbackUrl());
        return;
      }
      // Supabase also returns "no error + no session + user with empty
      // identities[]" when the email is already registered with
      // Email-confirm ON. This is the silent enumeration-protection
      // path; detect it and surface the same already-registered hint
      // rather than the misleading "we sent a confirmation" banner.
      if (
        result.data.user &&
        Array.isArray(result.data.user.identities) &&
        result.data.user.identities.length === 0
      ) {
        setState({ kind: "error", message: labels.signUpAlreadyRegistered });
        return;
      }
      // Email confirmation is ON for a genuine new signup — wait for
      // the user to click the link.
      setState({ kind: "success", message: labels.signUpEmailSent });
    } catch (err) {
      console.error("[login-email] signUp threw:", err);
      setState({ kind: "error", message: labels.signUpFailed });
    }
  }

  async function handleResetRequest() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setState({ kind: "loading", action: "reset" });
    try {
      const supabase = createClient();
      // After clicking the recovery link, Supabase routes the user back
      // to /auth/callback?code=...&type=recovery. The callback detects
      // type=recovery and redirects to /reset-password where the user
      // enters their new password.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const recoveryUrl = new URL("/api/auth/callback", appUrl);
      recoveryUrl.searchParams.set("locale", locale);
      recoveryUrl.searchParams.set("type", "recovery");

      const result = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: recoveryUrl.toString(),
      });
      if (result.error) {
        console.warn("[login-email] resetPasswordForEmail:", result.error.message);
        setState({ kind: "error", message: labels.resetFailed });
        return;
      }
      setState({ kind: "success", message: labels.resetEmailSent });
    } catch (err) {
      console.error("[login-email] resetPasswordForEmail threw:", err);
      setState({ kind: "error", message: labels.resetFailed });
    }
  }

  // Success state freezes the form so the user reads the message.
  // They can refresh the page to try again.
  if (state.kind === "success") {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        {state.message}
      </p>
    );
  }

  const isLoading = state.kind === "loading";
  const isReset = mode === "reset";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isReset) void handleResetRequest();
        // For auth mode, neither button is form's default — both are
        // explicit handlers below, so the form's onSubmit is only the
        // recovery path.
      }}
      className="space-y-3"
    >
      {isReset && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {labels.resetTitle}
        </p>
      )}

      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={labels.emailPlaceholder}
        disabled={isLoading}
        autoComplete="email"
        className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {!isReset && (
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={labels.passwordPlaceholder}
          disabled={isLoading}
          autoComplete="current-password"
          minLength={MIN_PASSWORD_LENGTH}
          className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
      )}

      {isReset ? (
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || email.trim().length === 0}
            className="flex-1 rounded-md bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {isLoading ? labels.signingIn : labels.resetSubmit}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("auth");
              setState({ kind: "idle" });
            }}
            disabled={isLoading}
            className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {labels.resetCancel}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isLoading || !email.trim() || !password}
              className="flex-1 rounded-md bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              {state.kind === "loading" && state.action === "signin"
                ? labels.signingIn
                : labels.signIn}
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={isLoading || !email.trim() || !password}
              className="flex-1 rounded-md border border-neutral-300 px-6 py-2.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {state.kind === "loading" && state.action === "signup"
                ? labels.signingUp
                : labels.signUp}
            </button>
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setState({ kind: "idle" });
              }}
              disabled={isLoading}
              className="text-xs text-neutral-500 underline hover:text-neutral-700 disabled:opacity-60 dark:hover:text-neutral-300"
            >
              {labels.forgotPassword}
            </button>
          </div>
        </>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.message}</p>
      )}
    </form>
  );
}
