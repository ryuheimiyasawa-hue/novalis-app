"use client";

import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Password reset form. Reached via the recovery email link:
//   1. user clicks "forgot password" on /login
//   2. resetPasswordForEmail sends a recovery link
//   3. recovery link → /api/auth/callback?type=recovery → exchange code
//   4. callback redirects here with the recovery session active
//   5. this form updates the password via supabase.auth.updateUser
//   6. on success, redirect to dashboard (or onboarding if not yet)
//
// The session is already established on the server side; we just need
// to update the user's password from the client.

interface Props {
  locale: string;
  labels: {
    newPasswordPlaceholder: string;
    confirmPasswordPlaceholder: string;
    submit: string;
    submitting: string;
    successMessage: string;
    mismatch: string;
    tooShort: string;
    failed: string;
  };
}

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ locale, labels }: Props) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(labels.tooShort);
      return;
    }
    if (newPassword !== confirm) {
      setErrorMsg(labels.mismatch);
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const result = await supabase.auth.updateUser({ password: newPassword });
      if (result.error) {
        console.warn("[reset-password] updateUser:", result.error.message);
        setErrorMsg(labels.failed);
        return;
      }
      setSuccess(true);
      // Brief delay so the success message is visible, then route.
      setTimeout(() => {
        router.push(`/${locale}/dashboard`);
      }, 1200);
    } catch (err) {
      console.error("[reset-password] updateUser threw:", err);
      setErrorMsg(labels.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <p
        role="status"
        className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
      >
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
        <span>{labels.successMessage}</span>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        required
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder={labels.newPasswordPlaceholder}
        aria-label={labels.newPasswordPlaceholder}
        disabled={submitting}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        className="h-12 w-full rounded-md border border-input bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-60"
      />
      <input
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={labels.confirmPasswordPlaceholder}
        aria-label={labels.confirmPasswordPlaceholder}
        disabled={submitting}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        className="h-12 w-full rounded-md border border-input bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={submitting || !newPassword || !confirm}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-60"
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
      {errorMsg && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>{errorMsg}</span>
        </p>
      )}
    </form>
  );
}
