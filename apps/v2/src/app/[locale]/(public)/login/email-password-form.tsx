"use client";

import { useState } from "react";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const FIELD_CLASS =
  "h-12 w-full rounded-md border border-input bg-card px-4 text-base text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none disabled:opacity-60";
const BUTTON_STRONG =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-primary bg-card px-5 text-sm font-medium text-primary transition-colors hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-60";
const BUTTON_QUIET =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-input bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60";

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
    signUpRateLimited: string;
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

const MIN_PASSWORD_LENGTH = 8;

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
        console.warn(
          "[login-email] signUp:",
          result.error.code,
          result.error.message,
        );
        const raw = result.error.message.toLowerCase();
        // Supabase Free tier limits confirmation emails to ~2-4/hour;
        // exceeding returns 429 with code over_email_send_rate_limit.
        // Beta testers will hit this quickly; surface a specific copy
        // so they know to wait rather than retrying immediately.
        // Phase 2: configure a custom SMTP (Resend etc.) to remove
        // this ceiling entirely.
        if (
          result.error.code === "over_email_send_rate_limit" ||
          raw.includes("email rate limit exceeded") ||
          raw.includes("rate limit")
        ) {
          setState({ kind: "error", message: labels.signUpRateLimited });
          return;
        }
        // Supabase phrases "already registered" several ways across
        // versions: "User already registered", "Email address ... is
        // already registered", or error code email_exists / user_already_exists.
        const alreadyRegistered =
          raw.includes("already registered") ||
          raw.includes("already exists") ||
          raw.includes("already in use") ||
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
      // Supabase silently returns success when the email is already
      // registered with Email-confirm ON (anti-enumeration). The
      // GoTrue server-side flag is exposed via the auth log action
      // user_repeated_signup, but on the JS SDK side the indicator is:
      //   - data.session is null
      //   - data.user is populated (the existing user, not a new one)
      //   - data.user.identities is null OR an empty array, depending
      //     on SDK version
      // We treat both null and [] as the "already registered" signal.
      if (
        result.data.user &&
        (!result.data.user.identities ||
          result.data.user.identities.length === 0)
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
      <p
        role="status"
        className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
      >
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
        <span>{state.message}</span>
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
        <p className="flex items-start gap-2.5 rounded-md bg-primary-soft px-3.5 py-3 text-sm text-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
          <span>{labels.resetTitle}</span>
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
        aria-label={labels.emailPlaceholder}
        className={FIELD_CLASS}
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
          aria-label={labels.passwordPlaceholder}
          className={FIELD_CLASS}
        />
      )}

      {isReset ? (
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || email.trim().length === 0}
            className={`flex-1 ${BUTTON_STRONG}`}
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
            className={BUTTON_QUIET}
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
              className={`flex-1 ${BUTTON_STRONG}`}
            >
              {state.kind === "loading" && state.action === "signin"
                ? labels.signingIn
                : labels.signIn}
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={isLoading || !email.trim() || !password}
              className={`flex-1 ${BUTTON_QUIET}`}
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
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60 md:min-h-8"
            >
              {labels.forgotPassword}
            </button>
          </div>
        </>
      )}

      {state.kind === "error" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}
