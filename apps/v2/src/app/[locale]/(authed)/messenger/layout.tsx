import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

// Shared app header (logo back to the dashboard, sections, language) and
// footer around the Messenger linking page.
export default async function MessengerLayout({
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
  const tCommon = await getTranslations({ locale: safeLocale, namespace: "common" });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        variant="app"
        switcher={
          <LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />
        }
      />
      {children}
      <SiteFooter locale={safeLocale} />
    </div>
  );
}
