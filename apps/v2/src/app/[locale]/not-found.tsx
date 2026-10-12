import Link from "next/link";
import { ArrowRightIcon, CompassIcon, HomeIcon } from "lucide-react";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { SiteFrame } from "@/components/layout/site-frame";

// Shown when a page under /[locale] calls notFound() — a missing article or
// restaurant, for example. Keeps the shared header and footer so the reader
// is never left on a dead end, and offers the two obvious ways back.
export default async function LocaleNotFound() {
  const requested = await getLocale();
  const locale = (
    hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
    <SiteFrame locale={locale}>
      <main
        id="main-content"
        className="mx-auto w-full max-w-[728px] flex-1 px-4 py-16 md:px-6 md:py-24"
      >
        <EmptyState
          icon={CompassIcon}
          tone="highlight"
          titleAs="h1"
          title={t("title")}
          description={t("body")}
          action={
            <>
              <Button asChild>
                <Link href={`/${locale}`}>
                  <HomeIcon aria-hidden />
                  {t("home")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/${locale}/articles`}>
                  {t("articles")}
                  <ArrowRightIcon aria-hidden />
                </Link>
              </Button>
            </>
          }
        />
      </main>
    </SiteFrame>
  );
}
