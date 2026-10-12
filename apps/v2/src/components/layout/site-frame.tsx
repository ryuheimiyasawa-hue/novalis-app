import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader, type SiteSection } from "./site-header";
import { SiteFooter } from "./site-footer";

// Header + footer around the public content sections (articles,
// restaurants, contact, legal). Used from each section's layout.tsx so the
// pages themselves only render their <main>.
export async function SiteFrame({
  locale,
  active,
  children,
}: {
  locale: "ja" | "en" | "tl";
  active?: SiteSection;
  children: React.ReactNode;
}) {
  const tCommon = await getTranslations({ locale, namespace: "common" });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={locale}
        active={active}
        switcher={
          <LocaleSwitcher currentLocale={locale} label={tCommon("language")} />
        }
      />
      {children}
      <SiteFooter locale={locale} />
    </div>
  );
}
