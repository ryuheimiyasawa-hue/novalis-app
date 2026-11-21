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
// language change), a blue band the card sits on, a short reminder of what
// the service does under the card, and the shared footer.
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
      {/* The header's blue runs on as a band behind the top of the card. */}
      <div className="relative flex-1">
        <div
          aria-hidden
          data-surface="brand"
          className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-primary to-primary-hover md:h-64"
        />
        <div className="relative mx-auto w-full max-w-[520px] px-4 pt-6 pb-12 md:pt-10 md:pb-16">
          {children}
          <aside className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card md:p-6">
            <h2 className="text-lg">{t("panelTitle")}</h2>
            <ul className="space-y-3">
              {(["general", "experts", "languages"] as const).map((key) => (
                <li key={key} className="flex items-start gap-3 text-base">
                  <span
                    aria-hidden
                    className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                  >
                    <CheckIcon className="size-3.5" strokeWidth={2} />
                  </span>
                  <span>{tLanding(`heroPoints.${key}`)}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2 border-t border-border pt-4">
              <li className="flex items-center gap-3">
                <IconTile icon={ShieldCheckIcon} size="sm" />
                <span className="text-sm font-medium">{tLanding("trust.pii.title")}</span>
              </li>
              <li className="flex items-center gap-3">
                <IconTile icon={ScaleIcon} size="sm" tone="caution" />
                <span className="text-sm font-medium">{tLanding("stepsNote")}</span>
              </li>
              <li className="flex items-center gap-3">
                <IconTile icon={LanguagesIcon} size="sm" />
                <span className="text-sm font-medium">{tLanding("trust.languages.title")}</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>
      <SiteFooter locale={safeLocale} />
    </div>
  );
}
