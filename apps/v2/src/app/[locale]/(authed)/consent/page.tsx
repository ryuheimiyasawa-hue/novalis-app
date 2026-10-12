import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from "@/lib/legal/versions";
import { gateDecision } from "@/lib/legal/consent";
import { createClient } from "@/lib/supabase/server";
import { FileTextIcon } from "lucide-react";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";
import { ConsentForm } from "./consent-form";

// Re-consent after a terms / privacy revision. The proxy sends onboarded
// users here when their latest consent is not the version in force, and
// exempts this path from that redirect so it cannot loop.
export default async function ConsentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? (locale as "ja" | "en" | "tl")
    : (routing.defaultLocale as "ja" | "en" | "tl");
  setRequestLocale(safeLocale);

  // Reached directly by someone who does not need it: send them on. Not
  // onboarded yet means /onboarding, which records consent itself.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consent_gate_state");
  if (!error) {
    const decision = gateDecision(data?.[0]);
    if (decision === "pass") redirect(`/${safeLocale}/dashboard`);
    if (decision === "onboarding") redirect(`/${safeLocale}/onboarding`);
  }

  const t = await getTranslations({ locale: safeLocale, namespace: "consent" });
  const tOnboarding = await getTranslations({ locale: safeLocale, namespace: "onboarding" });
  const tCommon = await getTranslations({ locale: safeLocale, namespace: "common" });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        showNav={false}
        switcher={<LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />}
      />
      <main id="main-content" className="flex flex-1 justify-center px-4 py-10 md:px-6 md:py-16">
        <div className="w-full max-w-[640px] space-y-8">
          <div className="space-y-3">
            <IconTile icon={FileTextIcon} size="lg" />
            <h1 className="text-2xl font-bold md:text-3xl">{t("heading")}</h1>
            <p className="text-base text-muted-foreground">{t("subheading")}</p>
          </div>
          <ConsentForm
            locale={safeLocale}
            termsVersion={CURRENT_TERMS_VERSION}
            privacyVersion={CURRENT_PRIVACY_VERSION}
            labels={{
              terms: tOnboarding("termsLabel"),
              privacy: tOnboarding("privacyLabel"),
              age: tOnboarding("ageLabel"),
              viewTerms: tOnboarding("viewTerms"),
              viewPrivacy: tOnboarding("viewPrivacy"),
              submit: t("submit"),
              error: t("error"),
              errorVersion: t("errorVersion"),
            }}
          />
        </div>
      </main>
      <SiteFooter locale={safeLocale} />
    </div>
  );
}
