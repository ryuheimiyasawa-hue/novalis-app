"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, Loader2Icon } from "lucide-react";
import {
  ConsentCheckboxes,
  INITIAL_CONSENT_STATE,
  isConsentComplete,
  type ConsentCheckboxLabels,
} from "@/components/legal/consent-checkboxes";

interface Props {
  locale: "ja" | "en" | "tl";
  termsVersion: string;
  privacyVersion: string;
  labels: ConsentCheckboxLabels & {
    submit: string;
    error: string;
    errorVersion: string;
  };
}

export function ConsentForm({ locale, termsVersion, privacyVersion, labels }: Props) {
  const router = useRouter();
  const [consent, setConsent] = useState(INITIAL_CONSENT_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isConsentComplete(consent);

  async function handleSubmit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          terms_version: termsVersion,
          privacy_version: privacyVersion,
          age_verified: true,
          terms_opened: consent.termsOpened,
          privacy_opened: consent.privacyOpened,
        }),
      });
      if (!res.ok) {
        // 409: the documents changed while this page was open. The user has
        // to see the new versions, so ask for a reload instead of retrying.
        setError(res.status === 409 ? labels.errorVersion : labels.error);
        setSubmitting(false);
        return;
      }
      router.replace(`/${locale}/dashboard`);
    } catch {
      setError(labels.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ConsentCheckboxes locale={locale} value={consent} onChange={setConsent} labels={labels} />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!ready || submitting}
        aria-busy={submitting}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && (
          <Loader2Icon className="size-5 animate-spin" strokeWidth={1.75} aria-hidden />
        )}
        {labels.submit}
      </button>
    </div>
  );
}
