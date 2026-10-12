import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CheckIcon, LanguagesIcon, ScaleIcon, ShieldCheckIcon } from "lucide-react";
import { routing } from "@/lib/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";
import { LanguageSwitcher } from "./language-switcher";

// Frame around the sign-in card: the shared header (carrying the login
// page's own language switcher, which keeps ?error= / ?redirect= across a
// language change), a short reminder of what the service does beside the
// card on wide screens, and the shared footer.
export default async function LoginLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  const t = await getTranslations({ locale: safeLocale, namespace: "login" });
  const tLanding = await getTranslations({ locale: safeLocale, namespace: "landing" });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        mobileNav={false}
        switcher={
          <Suspense fallback={null}>
            <LanguageSwitcher currentLocale={safeLocale} label={t("switchLanguage")} />
          </Suspense>
        }
      />
      <div className="mx-auto grid w-full max-w-[1120px] flex-1 items-start gap-10 px-4 py-10 md:px-6 md:py-16 lg:grid-cols-[1fr_460px] lg:gap-16">
        <div className="lg:order-2">{children}</div>
        <aside className="space-y-6 lg:order-1 lg:pt-6">
          <h2 className="text-2xl font-bold">{t("panelTitle")}</h2>
          <ul className="space-y-4">
            {(["general", "experts", "languages"] as const).map((key) => (
              <li key={key} className="flex items-start gap-3 text-base">
                <span
                  aria-hidden
                  className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                >
                  <CheckIcon className="size-3.5" strokeWidth={2.25} />
                </span>
                <span>{tLanding(`heroPoints.${key}`)}</span>
              </li>
            ))}
          </ul>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <IconTile icon={ShieldCheckIcon} size="sm" />
              <span className="text-sm font-medium">{tLanding("trust.pii.title")}</span>
            </li>
            <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <IconTile icon={ScaleIcon} size="sm" tone="caution" />
              <span className="text-sm font-medium">{tLanding("stepsNote")}</span>
            </li>
            <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <IconTile icon={LanguagesIcon} size="sm" />
              <span className="text-sm font-medium">{tLanding("trust.languages.title")}</span>
            </li>
          </ul>
        </aside>
      </div>
      <SiteFooter locale={safeLocale} />
    </div>
  );
}
