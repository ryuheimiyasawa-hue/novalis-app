"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, Loader2Icon, MapPinIcon } from "lucide-react";
import { PREFECTURES } from "@/lib/i18n/prefectures";
import {
  ConsentCheckboxes,
  INITIAL_CONSENT_STATE,
  isConsentComplete,
} from "@/components/legal/consent-checkboxes";

interface Props {
  locale: "ja" | "en" | "tl";
  termsVersion: string;
  privacyVersion: string;
  labels: {
    terms: string;
    privacy: string;
    age: string;
    viewTerms: string;
    viewPrivacy: string;
    submit: string;
    error: string;
    locationHeading: string;
    prefectureLabel: string;
    prefectureSelectPlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
  };
}

export function OnboardingForm({
  locale,
  termsVersion,
  privacyVersion,
  labels,
}: Props) {
  const router = useRouter();
  const [consent, setConsent] = useState(INITIAL_CONSENT_STATE);
  const [prefectureCode, setPrefectureCode] = useState("");
  const [cityName, setCityName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isConsentComplete(consent) && prefectureCode !== "";

  async function handleSubmit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          terms_version: termsVersion,
          privacy_version: privacyVersion,
          age_verified: true,
          terms_opened: consent.termsOpened,
          privacy_opened: consent.privacyOpened,
          preferred_language: locale,
          prefecture_code: prefectureCode,
          city_name: cityName.trim(),
        }),
      });
      if (!res.ok) {
        setError(labels.error);
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
      <ConsentCheckboxes
        locale={locale}
        value={consent}
        onChange={setConsent}
        labels={labels}
      />

      <fieldset className="space-y-4 rounded-lg border border-border bg-card p-5">
        <legend className="flex items-center gap-2 px-1 text-base font-bold">
          <MapPinIcon className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
          {labels.locationHeading}
        </legend>

        <div className="space-y-1.5">
          <label htmlFor="pref-select" className="block text-sm font-medium">
            {labels.prefectureLabel}
          </label>
          <select
            id="pref-select"
            value={prefectureCode}
            onChange={(e) => setPrefectureCode(e.target.value)}
            className={"h-12 w-full rounded-md border border-input bg-card px-3.5 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"}
          >
            <option value="">{labels.prefectureSelectPlaceholder}</option>
            {PREFECTURES.map((p) => (
              <option key={p.code} value={p.code}>
                {locale === "ja" ? p.ja : p.en}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="city-input" className="block text-sm font-medium">
            {labels.cityLabel}
          </label>
          <input
            id="city-input"
            type="text"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder={labels.cityPlaceholder}
            maxLength={100}
            className={"h-12 w-full rounded-md border border-input bg-card px-3.5 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"}
          />
        </div>
      </fieldset>

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
