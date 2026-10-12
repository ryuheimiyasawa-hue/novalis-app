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
import { HandHeartIcon } from "lucide-react";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";
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
  const tCommon = await getTranslations({
    locale: safeLocale,
    namespace: "common",
  });

  const cookieStore = await cookies();
  const stored = parsePreferredLanguage(
    cookieStore.get(PREFERRED_LANGUAGE_COOKIE)?.value,
  );
  const showWelcomeModal = stored === null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        showNav={false}
        switcher={
          <LocaleSwitcher
            currentLocale={safeLocale}
            label={tCommon("language")}
          />
        }
      />
      <main id="main-content" className="flex flex-1 justify-center px-4 py-10 md:px-6 md:py-16">
        <WelcomeModal currentLocale={safeLocale} initialShow={showWelcomeModal} />
        <div className="w-full max-w-[640px] space-y-8">
          <div className="space-y-3">
            <IconTile icon={HandHeartIcon} size="lg" tone="highlight" />
            <h1 className="text-2xl font-bold md:text-3xl">{t("heading")}</h1>
            <p className="text-base text-muted-foreground">
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
      <SiteFooter locale={safeLocale} />
    </div>
  );
}
