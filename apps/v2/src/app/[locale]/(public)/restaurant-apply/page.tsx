import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { PREFECTURES } from "@/lib/i18n/prefectures";
import { SiteFrame } from "@/components/layout/site-frame";
import { RestaurantCard } from "@/components/restaurants/restaurant-card";
import { RestaurantApplyForm } from "./restaurant-apply-form";

// Public page linked from the outreach email to Filipino restaurants.
// Works while the restaurant listing itself is still hidden
// (RESTAURANTS_PUBLIC=false): shops can register before the page opens.

type Locale = "ja" | "en" | "tl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as Locale;
  const t = await getTranslations({ locale: safeLocale, namespace: "restaurantApply" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function RestaurantApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as Locale;
  setRequestLocale(safeLocale);
  const { src } = await searchParams;
  const sourceCode = typeof src === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(src) ? src : "";

  const t = await getTranslations({ locale: safeLocale, namespace: "restaurantApply" });
  const prefectures = PREFECTURES.map((p) => ({
    code: p.code,
    label: safeLocale === "ja" ? p.ja : p.en,
  }));

  return (
    <SiteFrame locale={safeLocale}>
      <main id="main-content" className="w-full flex-1 px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto max-w-[720px] space-y-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-highlight-soft px-3 py-1 text-sm font-medium text-highlight-soft-foreground">
              {t("badge")}
            </span>
            <h1 className="text-2xl font-bold md:text-3xl">{t("title")}</h1>
            <p className="text-base text-muted-foreground">{t("lead")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("point1")}</li>
              <li>{t("point2")}</li>
              <li>{t("point3")}</li>
            </ul>
          </div>
          {/* What the shop gets: the intro video, the flyer, and a sample
              of how their listing will look, so one link in the outreach
              message is enough. */}
          <section className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-start">
            <div className="space-y-2">
              <h2 className="text-sm font-bold">{t("videoHeading")}</h2>
              <video
                className="w-full max-w-[220px] rounded-lg border border-border bg-black"
                src="/promo/morita-intro-tl.mp4"
                poster="/promo/morita-intro-poster.jpg"
                controls
                playsInline
                preload="none"
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-sm font-bold">{t("sampleHeading")}</h2>
                <div className="pointer-events-none max-w-[360px]" aria-label={t("sampleHeading")}>
                  <RestaurantCard
                    href="#"
                    name={t("sampleName")}
                    area={t("sampleArea")}
                    description={t("sampleDescription")}
                    photoUrl={null}
                    kindLabel={t("sampleKind")}
                    viewLabel={t("sampleView")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("sampleNote")}</p>
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold">{t("flyerHeading")}</h2>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a href="/promo/morita-flyer-tl.pdf" target="_blank" rel="noopener" className="text-primary hover:underline">{t("flyerTl")}</a>
                  <a href="/promo/morita-flyer-ja.pdf" target="_blank" rel="noopener" className="text-primary hover:underline">{t("flyerJa")}</a>
                </p>
              </div>
            </div>
          </section>

          <RestaurantApplyForm
            locale={safeLocale}
            prefectures={prefectures}
            sourceCode={sourceCode}
          />
        </div>
      </main>
    </SiteFrame>
  );
}
