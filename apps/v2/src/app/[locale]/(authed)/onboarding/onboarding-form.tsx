"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PREFECTURES } from "@/lib/i18n/prefectures";

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
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [age, setAge] = useState(false);
  const [prefectureCode, setPrefectureCode] = useState("");
  const [cityName, setCityName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = terms && privacy && age && prefectureCode !== "";

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
      <div className="space-y-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <Checkbox
          id="agree-terms"
          checked={terms}
          onChange={setTerms}
          label={labels.terms}
          link={{ href: `/${locale}/legal/terms`, text: labels.viewTerms }}
        />
        <Checkbox
          id="agree-privacy"
          checked={privacy}
          onChange={setPrivacy}
          label={labels.privacy}
          link={{ href: `/${locale}/legal/privacy`, text: labels.viewPrivacy }}
        />
        <Checkbox id="agree-age" checked={age} onChange={setAge} label={labels.age} />
      </div>

      <fieldset className="space-y-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <legend className="text-sm font-semibold px-1">
          {labels.locationHeading}
        </legend>

        <div className="space-y-1">
          <label htmlFor="pref-select" className="block text-sm">
            {labels.prefectureLabel}
          </label>
          <select
            id="pref-select"
            value={prefectureCode}
            onChange={(e) => setPrefectureCode(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <option value="">{labels.prefectureSelectPlaceholder}</option>
            {PREFECTURES.map((p) => (
              <option key={p.code} value={p.code}>
                {locale === "ja" ? p.ja : p.en}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="city-input" className="block text-sm">
            {labels.cityLabel}
          </label>
          <input
            id="city-input"
            type="text"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder={labels.cityPlaceholder}
            maxLength={100}
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </div>
      </fieldset>

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

function Checkbox({
  id,
  checked,
  onChange,
  label,
  link,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  link?: { href: string; text: string };
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span className="text-sm leading-relaxed">
        {label}
        {link && (
          <>
            {" — "}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-700 hover:text-blue-900"
              onClick={(e) => e.stopPropagation()}
            >
              {link.text}
            </a>
          </>
        )}
      </span>
    </label>
  );
}
