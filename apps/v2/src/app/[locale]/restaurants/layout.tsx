import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { RESTAURANTS_PUBLIC } from "@/lib/features";
import { routing } from "@/lib/i18n/routing";
import { SiteFrame } from "@/components/layout/site-frame";

// Shared header (logo, sections, language switcher) and footer for every
// page under /restaurants.
export default async function RestaurantsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Hidden while the listing only holds sample shops (see lib/features).
  if (!RESTAURANTS_PUBLIC) notFound();
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  return (
    <SiteFrame locale={safeLocale} active="restaurants">
      {children}
    </SiteFrame>
  );
}
