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
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-xl w-full space-y-6">
        <div className="flex justify-end">
          <LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{t("heading")}</h1>
          <p className="text-neutral-600 dark:text-neutral-300">{t("subheading")}</p>
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
  );
}
