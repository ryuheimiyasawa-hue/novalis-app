import { cookies } from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from "@/lib/legal/versions";
import {
  PREFERRED_LANGUAGE_COOKIE,
  parsePreferredLanguage,
} from "@/lib/i18n/preferred-language-cookie";
import { OnboardingForm } from "./onboarding-form";
import { WelcomeModal } from "./welcome-modal";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? (locale as "ja" | "en" | "tl")
    : (routing.defaultLocale as "ja" | "en" | "tl");
  setRequestLocale(safeLocale);

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "onboarding",
  });

  const cookieStore = await cookies();
  const stored = parsePreferredLanguage(
    cookieStore.get(PREFERRED_LANGUAGE_COOKIE)?.value,
  );
  const showWelcomeModal = stored === null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <WelcomeModal currentLocale={safeLocale} initialShow={showWelcomeModal} />
      <div className="max-w-xl w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{t("heading")}</h1>
          <p className="text-neutral-600 dark:text-neutral-300">
            {t("subheading")}
          </p>
        </div>
        <OnboardingForm
          locale={safeLocale}
          termsVersion={CURRENT_TERMS_VERSION}
          privacyVersion={CURRENT_PRIVACY_VERSION}
          labels={{
            terms: t("termsLabel"),
            privacy: t("privacyLabel"),
            age: t("ageLabel"),
            viewTerms: t("viewTerms"),
            viewPrivacy: t("viewPrivacy"),
            submit: t("submit"),
            error: t("error"),
            locationHeading: t("locationHeading"),
            prefectureLabel: t("prefectureLabel"),
            prefectureSelectPlaceholder: t("prefectureSelectPlaceholder"),
            cityLabel: t("cityLabel"),
            cityPlaceholder: t("cityPlaceholder"),
          }}
        />
      </div>
    </main>
  );
}
