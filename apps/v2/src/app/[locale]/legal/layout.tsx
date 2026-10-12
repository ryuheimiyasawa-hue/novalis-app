import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { SiteFrame } from "@/components/layout/site-frame";

// Shared header (logo, sections, language switcher) and footer for every
// page under /legal.
export default async function LegalLayout({
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
  return (
    <SiteFrame locale={safeLocale}>
      {children}
    </SiteFrame>
  );
}
