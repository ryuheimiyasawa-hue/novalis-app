"use client";

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

const MIN_PASSWORD_LENGTH = 6;

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
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        {labels.successMessage}
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
        disabled={submitting}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={labels.confirmPasswordPlaceholder}
        disabled={submitting}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={submitting || !newPassword || !confirm}
        className="w-full rounded-md bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
      {errorMsg && (
        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
      )}
    </form>
  );
}
