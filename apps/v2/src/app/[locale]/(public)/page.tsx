import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BotIcon,
  Building2Icon,
  CheckIcon,
  FacebookIcon,
  HeartPulseIcon,
  IdCardIcon,
  InfoIcon,
  LandmarkIcon,
  LanguagesIcon,
  MessagesSquareIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { isPaymentEnabled } from "@/lib/payment/is-payment-enabled";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";

// ISR: the restaurant strip reads the DB, so cache the page for 10 min rather
// than hitting Supabase on every landing visit.
export const revalidate = 600;

type Locale = "ja" | "en" | "tl";

interface RestaurantCard {
  id: string;
  name: string;
  prefecture_code: string;
  city_name: string;
  cuisine_type: string | null;
  photo_url: string | null;
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as Locale;
  setRequestLocale(safeLocale);
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  const tNav = await getTranslations("nav");
  const tCommon = await getTranslations("common");
  const tChat = await getTranslations("chat.ui");
  const tRestaurants = await getTranslations("restaurantsList");
  const tLegal = await getTranslations("legal");

  // Best-effort: the strip is hidden if the DB is unreachable. This also keeps
  // the build green where Supabase env is absent (local / CI prerender); on
  // Vercel the env is present at build so the strip prerenders with data.
  let restaurants: RestaurantCard[] = [];
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("restaurants")
      .select("id, name, prefecture_code, city_name, cuisine_type, photo_url")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(4);
    restaurants = (data ?? []) as RestaurantCard[];
  } catch (err) {
    console.warn(
      "[landing] restaurants strip skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }

  const features = [
    { key: "visa", icon: IdCardIcon },
    { key: "insurance", icon: HeartPulseIcon },
    { key: "procedures", icon: LandmarkIcon },
    { key: "family", icon: UsersIcon },
  ] as const;
  const steps = ["ask", "answer", "experts"] as const;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        mobileNav={false}
        switcher={
          <LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />
        }
        actions={
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href={`/${safeLocale}/login`}>{tNav("login")}</Link>
          </Button>
        }
      />

      <main id="main-content" className="flex-1">
        {/* Hero: who it is for, what it does, how to start — all above the fold. */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-[1120px] gap-12 px-4 pt-10 pb-16 md:px-6 md:pt-16 md:pb-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
            <div>
              <p className="inline-flex items-start gap-2 rounded-md bg-highlight-soft px-3 py-1.5 text-sm font-medium text-highlight-soft-foreground">
                <UsersIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>{t("heroEyebrow")}</span>
              </p>
              <p className="sr-only">{tApp("name")}</p>
              <h1 className="mt-5 text-2xl font-bold sm:text-3xl lg:text-4xl">
                {t("title")}
              </h1>
              <p className="mt-4 max-w-[600px] text-base text-muted-foreground md:text-xl md:leading-relaxed">
                {t("subtitle")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href={`/${safeLocale}/login`}>
                    <FacebookIcon aria-hidden />
                    {t("ctaPrimary")}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <a href="#how-it-works">
                    {t("ctaSecondary")}
                    <ArrowDownIcon aria-hidden />
                  </a>
                </Button>
              </div>
              <p className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
                {!isPaymentEnabled() && (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CheckIcon className="size-4" strokeWidth={2} aria-hidden />
                    {t("freeNote")}
                  </span>
                )}
                <span>{t("startNote")}</span>
              </p>
              <ul className="mt-8 space-y-3 border-t border-border pt-6">
                {(["general", "experts", "languages"] as const).map((key) => (
                  <li key={key} className="flex items-start gap-3 text-base">
                    <span
                      aria-hidden
                      className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                    >
                      <CheckIcon className="size-3.5" strokeWidth={2.25} />
                    </span>
                    <span>{t(`heroPoints.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Illustration of the consultation screen, drawn with CSS. */}
            <figure className="mx-auto w-full max-w-[480px]">
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute inset-0 translate-x-3 translate-y-3 rounded-lg bg-primary-soft"
                />
                <div
                  aria-hidden
                  className="relative overflow-hidden rounded-lg border border-border bg-card shadow-card"
                >
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <IconTile icon={MessagesSquareIcon} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{tChat("title")}</p>
                      <p className="text-xs text-muted-foreground">日本語 · English · Tagalog</p>
                    </div>
                  </div>
                  <div className="space-y-4 bg-background px-5 py-5">
                    <div className="ml-auto max-w-[85%] rounded-lg rounded-br-[4px] bg-primary px-4 py-3 text-sm text-primary-foreground">
                      {t("mockQuestion")}
                    </div>
                    <div className="flex items-start gap-2.5">
                      <IconTile icon={BotIcon} size="sm" />
                      <div className="max-w-[85%] rounded-lg rounded-tl-[4px] border border-border bg-card px-4 py-3 text-sm">
                        <p>{t("mockAnswer")}</p>
                        <p className="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
                          <InfoIcon className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                          {t("mockNote")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border border-border border-l-[3px] border-l-caution bg-card px-4 py-3">
                      <ScaleIcon className="mt-0.5 size-4 shrink-0 text-caution" strokeWidth={1.75} />
                      <p className="text-sm font-medium text-caution-foreground">{t("mockEscalation")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border px-5 py-4">
                    <div className="flex h-11 min-w-0 flex-1 items-center rounded-md border border-input bg-card px-3 text-sm text-muted-foreground">
                      <span className="truncate">{tChat("inputPlaceholder")}</span>
                    </div>
                    <span className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                      {tChat("send")}
                    </span>
                  </div>
                </div>
              </div>
              <figcaption className="mt-6 text-center text-xs text-muted-foreground">
                {t("mockCaption")}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* What we can help with */}
        <section
          id="features"
          aria-labelledby="features-heading"
          className="mx-auto max-w-[1120px] scroll-mt-4 px-4 py-16 md:px-6 md:py-24"
        >
          <div className="max-w-[680px] space-y-3">
            <h2 id="features-heading" className="text-2xl font-bold md:text-3xl">
              {t("featuresHeading")}
            </h2>
            <p className="text-base text-muted-foreground">{t("featuresLead")}</p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ key, icon }) => (
              <li
                key={key}
                className="rounded-lg border border-border bg-card p-6 shadow-card"
              >
                <IconTile icon={icon} tone="highlight" />
                <h3 className="mt-4 text-xl font-bold">{t(`features.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(`features.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works — the target of the "learn more" button. */}
        <section
          id="how-it-works"
          aria-labelledby="steps-heading"
          className="scroll-mt-4 border-y border-border bg-card"
        >
          <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-24">
            <div className="max-w-[680px] space-y-3">
              <h2 id="steps-heading" className="text-2xl font-bold md:text-3xl">
                {t("stepsHeading")}
              </h2>
              <p className="text-base text-muted-foreground">{t("stepsLead")}</p>
            </div>
            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {steps.map((key, i) => (
                <li key={key} className="relative flex gap-4 md:flex-col">
                  <span
                    aria-hidden
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-highlight text-base font-bold text-highlight-foreground"
                  >
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute top-5 left-14 hidden h-px w-[calc(100%-3.5rem)] bg-border md:block"
                    />
                  )}
                  <div className="space-y-2">
                    <h3
                      className={`text-xl font-bold ${key === "experts" ? "text-caution-foreground" : ""}`}
                    >
                      {t(`steps.${key}.title`)}
                    </h3>
                    <p className="text-base text-muted-foreground">{t(`steps.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-10 flex items-start gap-3 rounded-lg bg-primary-soft px-5 py-4 text-base text-foreground">
              <InfoIcon className="mt-1 size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
              {t("stepsNote")}
            </p>
          </div>
        </section>

        {/* Safeguards */}
        <section
          aria-labelledby="trust-heading"
          className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-24"
        >
          <div className="max-w-[680px] space-y-3">
            <h2 id="trust-heading" className="text-2xl font-bold md:text-3xl">
              {t("trustHeading")}
            </h2>
            <p className="text-base text-muted-foreground">{t("trustLead")}</p>
          </div>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            <li className="rounded-lg border border-border bg-card p-6 shadow-card">
              <IconTile icon={ShieldCheckIcon} />
              <h3 className="mt-4 text-xl font-bold">{t("trust.pii.title")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("trust.pii.body")}</p>
            </li>
            <li className="rounded-lg border border-border bg-card p-6 shadow-card">
              <IconTile icon={LanguagesIcon} />
              <h3 className="mt-4 text-xl font-bold">{t("trust.languages.title")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("trust.languages.body")}</p>
            </li>
            <li className="rounded-lg border border-border bg-card p-6 shadow-card">
              <IconTile icon={Building2Icon} />
              <h3 className="mt-4 text-xl font-bold">{t("trust.operator.title")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("trust.operator.body")}</p>
              <ul className="mt-3 flex flex-wrap gap-x-4">
                <li>
                  <Link
                    href={`/${safeLocale}/contact`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-8"
                  >
                    {tNav("contact")}
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${safeLocale}/legal/terms`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-8"
                  >
                    {tLegal("termsTitle")}
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${safeLocale}/legal/privacy`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-8"
                  >
                    {tLegal("privacyTitle")}
                  </Link>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        {restaurants.length > 0 && (
          <section
            aria-labelledby="restaurants-heading"
            className="border-t border-border bg-card"
          >
            <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-24">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[680px] space-y-3">
                  <h2 id="restaurants-heading" className="text-2xl font-bold md:text-3xl">
                    {t("restaurantsHeading")}
                  </h2>
                  <p className="text-base text-muted-foreground">{tRestaurants("subtitle")}</p>
                </div>
                <Link
                  href={`/${safeLocale}/restaurants`}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("restaurantsViewAll")}
                  <ArrowRightIcon className="size-4" strokeWidth={1.75} aria-hidden />
                </Link>
              </div>
              <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {restaurants.map((r) => {
                  const pref = getPrefectureLabel(r.prefecture_code, safeLocale);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/${safeLocale}/restaurants/${r.id}`}
                        className="block h-full overflow-hidden rounded-lg border border-border bg-card shadow-card transition-colors hover:border-primary/40"
                      >
                        {r.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.photo_url}
                            alt={r.name}
                            loading="lazy"
                            className="aspect-[4/3] w-full object-cover"
                          />
                        ) : (
                          <div
                            aria-hidden
                            className="flex aspect-[4/3] w-full items-center justify-center bg-highlight-soft text-highlight-soft-foreground"
                          >
                            <UtensilsCrossedIcon className="size-8" strokeWidth={1.75} />
                          </div>
                        )}
                        <div className="space-y-1 p-4">
                          <p className="line-clamp-2 text-base font-bold">{r.name}</p>
                          <p className="line-clamp-1 text-sm text-muted-foreground">
                            {[r.cuisine_type, pref].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* Closing call to action */}
        <section className="mx-auto max-w-[1120px] px-4 pb-16 md:px-6 md:pb-24">
          <div className="flex flex-col gap-6 rounded-lg bg-primary px-6 py-10 text-primary-foreground md:flex-row md:items-center md:justify-between md:px-12 md:py-12">
            <div className="max-w-[600px] space-y-2">
              <h2 className="text-2xl font-bold">{t("closingTitle")}</h2>
              <p className="text-base opacity-90">{t("closingBody")}</p>
            </div>
            <Button
              asChild
              size="lg"
              className="w-full bg-card text-primary shadow-none hover:bg-primary-soft md:w-auto"
            >
              <Link href={`/${safeLocale}/login`}>
                <FacebookIcon aria-hidden />
                {t("ctaPrimary")}
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter locale={safeLocale} />
    </div>
  );
}
