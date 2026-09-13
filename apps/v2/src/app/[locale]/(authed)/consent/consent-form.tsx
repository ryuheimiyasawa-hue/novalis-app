"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!ready || submitting}
        className="w-full px-6 py-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {labels.submit}
      </button>
    </div>
  );
}
