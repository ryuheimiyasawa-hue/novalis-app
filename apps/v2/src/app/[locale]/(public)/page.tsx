import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  BotIcon,
  BriefcaseIcon,
  Building2Icon,
  ChevronRightIcon,
  FacebookIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  IdCardIcon,
  InfoIcon,
  LandmarkIcon,
  LanguagesIcon,
  MailIcon,
  MessagesSquareIcon,
  ScaleIcon,
  SendHorizontalIcon,
  ShieldCheckIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { pickRestaurantName } from "@/lib/restaurants/localize";
import { isPaymentEnabled } from "@/lib/payment/is-payment-enabled";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";
import {
  ArticleRow,
  formatArticleDate,
  isFresh,
} from "@/components/articles/article-row";
import { RestaurantCard, restaurantKind } from "@/components/restaurants/restaurant-card";
import { StickyAskCta } from "./sticky-ask-cta";

// ISR: the restaurant strip and the latest guides read the DB, so cache the
// page for 10 min rather than hitting Supabase on every landing visit.
export const revalidate = 600;

type Locale = "ja" | "en" | "tl";

interface RestaurantCard {
  id: string;
  name: string;
  name_en: string | null;
  prefecture_code: string;
  city_name: string;
  cuisine_type: string | null;
  photo_url: string | null;
}

interface LatestArticle {
  id: string;
  slug: string;
  title_ja: string;
  title_en: string | null;
  title_tl: string | null;
  published_at: string | null;
  category:
    | { slug: string; name_ja: string; name_en: string; name_tl: string }
    | null;
}

function pickArticleTitle(a: LatestArticle, locale: Locale): string {
  if (locale === "en" && a.title_en) return a.title_en;
  if (locale === "tl" && a.title_tl) return a.title_tl;
  return a.title_ja;
}

function pickArticleCategory(a: LatestArticle, locale: Locale): string | null {
  if (!a.category) return null;
  if (locale === "en") return a.category.name_en ?? a.category.name_ja;
  if (locale === "tl") return a.category.name_tl ?? a.category.name_ja;
  return a.category.name_ja;
}

/** Render time, for the NEW badge (ISR keeps it at most 10 min stale). */
function currentTime(): number {
  return Date.now();
}

const HERO_CTA_ID = "hero-ask-cta";

// Every "what's your concern" entry leads to the consultation: the chat for
// signed-in visitors; the proxy sends everyone else to log in first and
// back to the chat afterwards.
const CONCERNS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "visa", icon: IdCardIcon },
  { key: "family", icon: UsersIcon },
  { key: "insurance", icon: HeartPulseIcon },
  { key: "kids", icon: GraduationCapIcon },
  { key: "work", icon: BriefcaseIcon },
  { key: "cityhall", icon: LandmarkIcon },
];

/** Illustration of the consultation screen, drawn with CSS. */
function ChatMock({
  title,
  question,
  answer,
  note,
  escalation,
  placeholder,
  send,
  caption,
  captionClassName,
}: {
  title: string;
  question: string;
  answer: string;
  note: string;
  escalation: string;
  placeholder: string;
  send: string;
  caption: string;
  captionClassName?: string;
}) {
  return (
    <figure className="mx-auto w-full max-w-[460px]">
      <div
        aria-hidden
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_24px_60px_-20px_rgb(var(--shadow-color)/0.45)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <IconTile icon={MessagesSquareIcon} size="sm" />
          <div className="min-w-0">
            <p className="font-display text-sm font-extrabold">{title}</p>
            <p className="text-xs text-muted-foreground">日本語 · English · Tagalog</p>
          </div>
        </div>
        <div className="space-y-4 bg-background px-5 py-5">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-[6px] bg-primary px-4 py-3 text-sm text-primary-foreground">
            {question}
          </div>
          <div className="flex items-start gap-2.5">
            <IconTile icon={BotIcon} size="sm" />
            <div className="max-w-[85%] rounded-2xl rounded-tl-[6px] border border-border bg-card px-4 py-3 text-sm">
              <p>{answer}</p>
              <p className="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                {note}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border border-l-[3px] border-l-caution bg-card px-4 py-3">
            <ScaleIcon className="mt-0.5 size-4 shrink-0 text-caution" strokeWidth={1.75} />
            <p className="text-sm font-medium text-caution-foreground">{escalation}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          <div className="flex h-11 min-w-0 flex-1 items-center rounded-full border border-input bg-card px-4 text-sm text-muted-foreground">
            <span className="truncate">{placeholder}</span>
          </div>
          <span className="inline-flex h-11 items-center rounded-full bg-primary px-4 font-display text-sm font-bold text-primary-foreground">
            {send}
          </span>
        </div>
      </div>
      <figcaption className={captionClassName ?? "mt-4 text-center text-xs text-muted-foreground"}>
        {caption}
      </figcaption>
    </figure>
  );
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
  const tArticles = await getTranslations("articlesList");
  const tLegal = await getTranslations("legal");

  // Best-effort: each strip is hidden if the DB is unreachable. This also
  // keeps the build green where Supabase env is absent (local / CI
  // prerender); on Vercel the env is present at build so they prerender
  // with data.
  let restaurants: RestaurantCard[] = [];
  let latest: LatestArticle[] = [];
  try {
    const admin = getAdminClient();
    const [restaurantsRes, articlesRes] = await Promise.all([
      admin
        .from("restaurants")
        .select("id, name, name_en, prefecture_code, city_name, cuisine_type, photo_url")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(4),
      // Read-only: the same published-articles listing as /articles,
      // first four rows only.
      admin
        .from("articles")
        .select(
          "id, slug, title_ja, title_en, title_tl, published_at, category:categories(slug, name_ja, name_en, name_tl)",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(4),
    ]);
    if (restaurantsRes.error) {
      console.warn("[landing] restaurants strip skipped:", restaurantsRes.error.message);
    }
    if (articlesRes.error) {
      console.warn("[landing] latest guides skipped:", articlesRes.error.message);
    }
    restaurants = (restaurantsRes.data ?? []) as RestaurantCard[];
    latest = (articlesRes.data ?? []) as unknown as LatestArticle[];
  } catch (err) {
    console.warn(
      "[landing] DB strips skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }

  const now = currentTime();
  const free = !isPaymentEnabled();
  const askHref = `/${safeLocale}/chat`;
  const loginHref = `/${safeLocale}/login`;
  const steps = ["ask", "answer", "experts"] as const;

  const topics: Array<{ href: string; label: string; icon: LucideIcon }> = [
    { href: `/${safeLocale}/articles`, label: tNav("articles"), icon: BookOpenIcon },
    { href: `/${safeLocale}/restaurants`, label: t("topics.food"), icon: UtensilsCrossedIcon },
    { href: askHref, label: t("ctaAsk"), icon: MessagesSquareIcon },
    { href: `/${safeLocale}/contact`, label: tNav("contact"), icon: MailIcon },
  ];

  const mock = {
    title: tChat("title"),
    question: t("mockQuestion"),
    answer: t("mockAnswer"),
    note: t("mockNote"),
    escalation: t("mockEscalation"),
    placeholder: tChat("inputPlaceholder"),
    send: tChat("send"),
    caption: t("mockCaption"),
  };

  const stats = [
    { key: "languages", show: true },
    { key: "free", show: free },
    { key: "operator", show: true },
  ].filter((s) => s.show);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        mobileNav={false}
        switcher={
          <LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />
        }
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden border-primary-foreground/70 bg-transparent text-primary-foreground hover:border-primary-foreground hover:bg-primary-hover hover:text-primary-foreground sm:inline-flex"
          >
            <Link href={loginHref}>{tNav("login")}</Link>
          </Button>
        }
      />

      <main id="main-content" className="flex-1">
        {/* Hero: the header's blue continues into one surface. The first
            screen is an entrance for worries, not a feature list. */}
        <section
          data-surface="brand"
          aria-labelledby="hero-heading"
          className="bg-gradient-to-b from-primary to-primary-hover text-primary-foreground"
        >
          <nav aria-label={t("topicsLabel")} className="mx-auto max-w-[1120px] lg:hidden">
            <ul className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-1 pb-3 md:px-6">
              {topics.map(({ href, label, icon: Icon }) => (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 font-display text-sm font-bold whitespace-nowrap text-primary transition-colors hover:bg-primary-soft"
                  >
                    <Icon className="size-4" strokeWidth={2} aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-4 pt-4 pb-8 md:px-6 md:pt-8 md:pb-16 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14">
            <div>
              <p className="inline-flex rounded-full bg-highlight px-3 py-1 font-display text-sm font-extrabold text-highlight-foreground">
                {t("heroEyebrow")}
              </p>
              <p className="sr-only">{tApp("name")}</p>
              <h1 id="hero-heading" className="mt-3 text-3xl md:mt-4 lg:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-3 max-w-[600px] text-[17px] text-primary-foreground/90 md:mt-4 md:text-lg">
                {t("subtitle")}
              </p>

              {/* Looks like a search box, works as a link into the
                  consultation (the chat itself is unchanged). */}
              <Link
                href={askHref}
                aria-label={`${t("ctaAsk")}: ${t("askBarPlaceholder")}`}
                className="mt-5 flex min-h-14 items-center gap-3 rounded-2xl bg-card py-2 pr-2 pl-4 text-left text-muted-foreground shadow-card transition-shadow hover:shadow-lg md:mt-6 md:min-h-16"
              >
                <MessagesSquareIcon className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 text-base leading-snug">
                  {t("askBarPlaceholder")}
                </span>
                <span
                  aria-hidden
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground"
                >
                  <SendHorizontalIcon className="size-5" strokeWidth={2} />
                </span>
              </Link>

              <div className="mt-3">
                <p className="sr-only">{t("quickQuestionsLabel")}</p>
                <ul className="flex flex-wrap gap-2">
                  {(["visa", "school", "insurance"] as const).map((key) => (
                    <li key={key}>
                      <Link
                        href={askHref}
                        className="inline-flex min-h-10 items-center rounded-full border border-primary-foreground/50 bg-primary-foreground/10 px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/20"
                      >
                        {t(`quickQuestions.${key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-6">
                <Button asChild variant="highlight" size="xl" className="w-full sm:w-auto">
                  <Link id={HERO_CTA_ID} href={askHref}>
                    <MessagesSquareIcon aria-hidden />
                    {t("ctaAsk")}
                  </Link>
                </Button>
                <Button asChild variant="facebook" size="lg" className="h-[52px] w-full sm:h-14 sm:w-auto">
                  <Link href={loginHref}>
                    <FacebookIcon className="size-5 fill-current" strokeWidth={0} aria-hidden />
                    {t("ctaPrimary")}
                  </Link>
                </Button>
              </div>

              <ul className="mt-4 flex flex-wrap gap-2 text-[13px]">
                {free && (
                  <li className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1">
                    <ShieldCheckIcon className="size-4" strokeWidth={2} aria-hidden />
                    {t("trustPills.free")}
                  </li>
                )}
                <li className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1">
                  <Building2Icon className="size-4" strokeWidth={2} aria-hidden />
                  {t("trustPills.operator")}
                </li>
                <li className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1">
                  <LanguagesIcon className="size-4" strokeWidth={2} aria-hidden />
                  {t("trustPills.languages")}
                </li>
              </ul>
            </div>

            {/* The mock floats on the blue on wide screens; phones see it
                after the concern tiles instead. */}
            <div className="hidden lg:block">
              <ChatMock {...mock} captionClassName="mt-4 text-center text-xs text-primary-foreground/85" />
            </div>
          </div>
        </section>

        {/* What's your concern: six large tiles, each an entrance to the
            consultation. */}
        <section
          id="features"
          aria-labelledby="features-heading"
          className="mx-auto max-w-[1120px] scroll-mt-4 px-4 pt-6 pb-12 md:px-6 md:pt-12 md:pb-20"
        >
          <div className="max-w-[680px] space-y-1.5">
            <h2 id="features-heading" className="text-2xl">
              {t("featuresHeading")}
            </h2>
            <p className="text-base text-muted-foreground">{t("featuresLead")}</p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:mt-6 md:gap-4 lg:grid-cols-3">
            {CONCERNS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={askHref}
                  className="group relative flex h-full min-h-24 flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-colors hover:border-primary/50 md:flex-row md:items-center md:gap-4 md:p-5"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
                  >
                    <Icon className="size-6" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 pr-5">
                    <span className="block font-display text-base leading-snug font-extrabold text-foreground group-hover:text-primary md:text-lg">
                      {t(`concerns.${key}.title`)}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {t(`concerns.${key}.body`)}
                    </span>
                  </span>
                  <ChevronRightIcon
                    className="absolute top-3.5 right-3 size-5 text-primary md:top-1/2 md:right-4 md:-translate-y-1/2"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10 lg:hidden">
            <ChatMock {...mock} />
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          aria-labelledby="steps-heading"
          className="scroll-mt-4 border-y border-border bg-card"
        >
          <div className="mx-auto max-w-[1120px] px-4 py-12 md:px-6 md:py-20">
            <div className="max-w-[680px] space-y-1.5">
              <h2 id="steps-heading" className="text-2xl">
                {t("stepsHeading")}
              </h2>
              <p className="text-base text-muted-foreground">{t("stepsLead")}</p>
            </div>
            <ol className="mt-6 grid gap-3 md:mt-8 md:grid-cols-3 md:gap-4">
              {steps.map((key, i) => (
                <li
                  key={key}
                  className="flex gap-4 rounded-2xl border border-border bg-background p-5 md:flex-col md:p-6"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-highlight font-display text-lg font-extrabold text-highlight-foreground"
                  >
                    {i + 1}
                  </span>
                  <div className="space-y-1.5">
                    <h3
                      className={`text-lg leading-snug ${key === "experts" ? "text-caution-foreground" : ""}`}
                    >
                      {t(`steps.${key}.title`)}
                    </h3>
                    <p className="text-base text-muted-foreground">{t(`steps.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 flex items-start gap-3 rounded-xl border border-border border-l-4 border-l-caution bg-card px-5 py-4 text-base text-foreground">
              <ScaleIcon className="mt-1 size-5 shrink-0 text-caution" strokeWidth={1.75} aria-hidden />
              {t("stepsNote")}
            </p>
          </div>
        </section>

        {/* Latest guides: a Philstar-style headline list. */}
        {latest.length > 0 && (
          <section
            aria-labelledby="latest-heading"
            className="mx-auto max-w-[1120px] px-4 py-12 md:px-6 md:py-20"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div className="max-w-[680px] space-y-1.5">
                <h2 id="latest-heading" className="text-2xl">
                  {t("latestHeading")}
                </h2>
                <p className="text-base text-muted-foreground">{t("latestLead")}</p>
              </div>
              <Link
                href={`/${safeLocale}/articles`}
                className="inline-flex min-h-11 items-center gap-1.5 font-display text-sm font-bold text-primary underline-offset-4 hover:underline"
              >
                {t("latestViewAll")}
                <ArrowRightIcon className="size-4" strokeWidth={2} aria-hidden />
              </Link>
            </div>
            <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-card md:mt-6 md:grid md:grid-cols-2 md:gap-x-8 md:divide-y-0 md:px-6">
              {latest.map((a) => (
                <li key={a.id} className="md:border-b md:border-border md:[&:nth-last-child(-n+2)]:border-b-0">
                  <ArticleRow
                    compact
                    href={`/${safeLocale}/articles/${a.slug}`}
                    title={pickArticleTitle(a, safeLocale)}
                    categorySlug={a.category?.slug ?? null}
                    categoryLabel={pickArticleCategory(a, safeLocale)}
                    dateLabel={formatArticleDate(a.published_at, safeLocale)}
                    dateTime={a.published_at}
                    fresh={isFresh(a.published_at, now)}
                    newLabel={tArticles("newBadge")}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pinoy sa Japan: When In Manila style photo cards. */}
        {restaurants.length > 0 && (
          <section
            aria-labelledby="restaurants-heading"
            className="border-t border-border bg-card"
          >
            <div className="mx-auto max-w-[1120px] py-12 md:py-20">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-4 md:px-6">
                <div className="max-w-[680px] space-y-1.5">
                  <h2 id="restaurants-heading" className="text-2xl">
                    {t("restaurantsHeading")}
                  </h2>
                  <p className="text-base text-muted-foreground">{tRestaurants("subtitle")}</p>
                </div>
                <Link
                  href={`/${safeLocale}/restaurants`}
                  className="inline-flex min-h-11 items-center gap-1.5 font-display text-sm font-bold text-primary underline-offset-4 hover:underline"
                >
                  {t("restaurantsViewAll")}
                  <ArrowRightIcon className="size-4" strokeWidth={2} aria-hidden />
                </Link>
              </div>
              <ul className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mt-6 md:px-6 lg:grid lg:snap-none lg:grid-cols-3 lg:overflow-visible">
                {restaurants.map((r, i) => (
                  <li
                    key={r.id}
                    className={`w-[78%] max-w-[320px] shrink-0 snap-start sm:w-[46%] lg:w-auto lg:max-w-none ${i >= 3 ? "lg:hidden" : ""}`}
                  >
                    <RestaurantCard
                      href={`/${safeLocale}/restaurants/${r.id}`}
                      name={pickRestaurantName(r, safeLocale)}
                      area={getPrefectureLabel(r.prefecture_code, safeLocale) ?? ""}
                      description={null}
                      photoUrl={r.photo_url}
                      kindLabel={tRestaurants(`kind.${restaurantKind(r.cuisine_type)}`)}
                      viewLabel={tRestaurants("view")}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Safeguards: facts only (languages, price, operator). */}
        <section
          aria-labelledby="trust-heading"
          className="mx-auto max-w-[1120px] px-4 py-12 md:px-6 md:py-20"
        >
          <div className="max-w-[680px] space-y-1.5">
            <h2 id="trust-heading" className="text-2xl">
              {t("trustHeading")}
            </h2>
            <p className="text-base text-muted-foreground">{t("trustLead")}</p>
          </div>
          <dl
            className={`mt-6 grid divide-y divide-border rounded-2xl border border-border bg-card shadow-card sm:divide-x sm:divide-y-0 ${
              stats.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            {stats.map(({ key }) => (
              <div key={key} className="flex flex-col-reverse gap-1 px-5 py-4 md:px-6 md:py-6">
                <dt className="text-sm text-muted-foreground">{t(`stats.${key}.label`)}</dt>
                <dd className="font-display text-2xl leading-tight font-extrabold text-primary md:text-3xl">
                  {t(`stats.${key}.value`)}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            <li className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6">
              <IconTile icon={ShieldCheckIcon} size="lg" />
              <h3 className="mt-4 text-lg leading-snug">{t("trust.pii.title")}</h3>
              <p className="mt-2 text-base text-muted-foreground">{t("trust.pii.body")}</p>
            </li>
            <li className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6">
              <IconTile icon={LanguagesIcon} size="lg" />
              <h3 className="mt-4 text-lg leading-snug">{t("trust.languages.title")}</h3>
              <p className="mt-2 text-base text-muted-foreground">{t("trust.languages.body")}</p>
            </li>
            <li className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6">
              <IconTile icon={Building2Icon} size="lg" />
              <h3 className="mt-4 text-lg leading-snug">{t("trust.operator.title")}</h3>
              <p className="mt-2 text-base text-muted-foreground">{t("trust.operator.body")}</p>
              <ul className="mt-3 flex flex-wrap gap-x-4">
                <li>
                  <Link
                    href={`/${safeLocale}/contact`}
                    className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline lg:min-h-8"
                  >
                    {tNav("contact")}
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${safeLocale}/legal/terms`}
                    className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline lg:min-h-8"
                  >
                    {tLegal("termsTitle")}
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${safeLocale}/legal/privacy`}
                    className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline lg:min-h-8"
                  >
                    {tLegal("privacyTitle")}
                  </Link>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        {/* Closing call to action: a solid blue band. */}
        <section
          data-surface="brand"
          aria-labelledby="closing-heading"
          className="bg-gradient-to-b from-primary to-primary-hover text-primary-foreground"
        >
          <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between md:px-6 md:py-16">
            <div className="max-w-[600px] space-y-2">
              <h2 id="closing-heading" className="text-2xl md:text-3xl">
                {t("closingTitle")}
              </h2>
              <p className="text-base text-primary-foreground/90 md:text-lg">{t("closingBody")}</p>
            </div>
            <Button asChild variant="highlight" size="xl" className="w-full md:w-auto">
              <Link href={askHref}>
                <MessagesSquareIcon aria-hidden />
                {t("ctaAsk")}
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter locale={safeLocale} />
      {/* Room under the footer for the phone-only sticky CTA. */}
      <div aria-hidden className="h-20 bg-footer md:hidden" />
      <StickyAskCta href={askHref} label={t("ctaAsk")} watchId={HERO_CTA_ID} />
    </div>
  );
}
