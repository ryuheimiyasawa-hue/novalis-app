import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessagesSquareIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { HomeLink } from "@/components/layout/home-link";
import { PageBand } from "@/components/layout/page-band";
import {
  ArticleRow,
  formatArticleDate,
  isFresh,
} from "@/components/articles/article-row";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

// Public articles list (C). ISR-cached for 10 min so dashboard CTAs
// can hammer the route without burning DB requests. Filters by
// category / prefecture are URL-driven only in MVP (the API supports
// them; UI controls land in Phase 2). Pagination is "Prev / Next"
// only, matching the proposal scope.

export const revalidate = 600;
const PAGE_SIZE = 20;
const SNIPPET_MAX = 140;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface ArticleRow {
  id: string;
  slug: string;
  title_ja: string;
  title_en: string | null;
  title_tl: string | null;
  body_ja: string;
  body_en: string | null;
  body_tl: string | null;
  published_at: string | null;
  category:
    | { slug: string; name_ja: string; name_en: string; name_tl: string }
    | null;
}

function pickTitle(a: ArticleRow, locale: "ja" | "en" | "tl"): string {
  if (locale === "en" && a.title_en) return a.title_en;
  if (locale === "tl" && a.title_tl) return a.title_tl;
  return a.title_ja;
}
function pickBody(a: ArticleRow, locale: "ja" | "en" | "tl"): string {
  if (locale === "en" && a.body_en) return a.body_en;
  if (locale === "tl" && a.body_tl) return a.body_tl;
  return a.body_ja;
}
function pickCategory(a: ArticleRow, locale: "ja" | "en" | "tl"): string | null {
  if (!a.category) return null;
  if (locale === "en") return a.category.name_en ?? a.category.name_ja;
  if (locale === "tl") return a.category.name_tl ?? a.category.name_ja;
  return a.category.name_ja;
}

/** Render time, for the NEW badge. The page is ISR-cached for 10 min, so
 *  the badge can be at most that stale. */
function currentTime(): number {
  return Date.now();
}

/** Pull the leading prose chunk out of a markdown body for the list
 *  snippet. Strips heading markers and code fences so the preview
 *  reads like sentences. */
function snippet(markdown: string, max: number): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*?(.+?)\*\*?/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/[#*_>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

export default async function ArticlesListPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  const { page: pageRaw } = await searchParams;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  setRequestLocale(safeLocale);

  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = getAdminClient();
  const { data, count, error } = await admin
    .from("articles")
    .select(
      "id, slug, title_ja, title_en, title_tl, body_ja, body_en, body_tl, published_at, category:categories(slug, name_ja, name_en, name_tl)",
      { count: "exact" },
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "articlesList",
  });
  const tCommon = await getTranslations({
    locale: safeLocale,
    namespace: "common",
  });
  const tDashboard = await getTranslations({
    locale: safeLocale,
    namespace: "dashboard",
  });

  if (error) {
    console.error("[articles list] fetch failed:", error.message);
    return (
      <main id="main-content" className="w-full flex-1">
        <PageBand
          icon={BookOpenIcon}
          kicker={t("kicker")}
          title={t("title")}
          description={t("subtitle")}
          top={<HomeLink locale={safeLocale} tone="brand" />}
        />
        <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6 md:py-12">
        <EmptyState
          role="alert"
          icon={TriangleAlertIcon}
          tone="caution"
          title={t("loadError")}
          action={
            <Button asChild variant="outline">
              <Link href={`/${safeLocale}/articles`}>
                <RefreshCwIcon aria-hidden />
                {tCommon("reload")}
              </Link>
            </Button>
          }
        />
        </div>
      </main>
    );
  }

  const rows = (data ?? []) as unknown as ArticleRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const now = currentTime();

  return (
    <main id="main-content" className="w-full flex-1">
      <PageBand
        icon={BookOpenIcon}
        kicker={t("kicker")}
        title={t("title")}
        description={t("subtitle")}
        top={<HomeLink locale={safeLocale} tone="brand" />}
      />
      <div className="mx-auto max-w-[1120px] px-4 py-6 md:px-6 md:py-10">

      {rows.length === 0 ? (
        <EmptyState
          role="status"
          icon={BookOpenIcon}
          title={t("empty")}
          description={tDashboard("chatCtaBody")}
          action={
            <Button asChild>
              <Link href={`/${safeLocale}/chat`}>
                <MessagesSquareIcon aria-hidden />
                {tDashboard("chatCtaButton")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-card md:px-6">
          {rows.map((row) => (
            <li key={row.id}>
              <ArticleRow
                href={`/${safeLocale}/articles/${row.slug}`}
                title={pickTitle(row, safeLocale)}
                categorySlug={row.category?.slug ?? null}
                categoryLabel={pickCategory(row, safeLocale)}
                dateLabel={formatArticleDate(row.published_at, safeLocale)}
                dateTime={row.published_at}
                fresh={isFresh(row.published_at, now)}
                newLabel={t("newBadge")}
                excerpt={snippet(pickBody(row, safeLocale), SNIPPET_MAX)}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
          {hasPrev ? (
            <Button asChild variant="outline">
              <Link href={`/${safeLocale}/articles?page=${page - 1}`}>
                <ChevronLeftIcon aria-hidden />
                {t("prev")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            {t("pageOf", { page, total: totalPages })}
          </span>
          {hasNext ? (
            <Button asChild variant="outline">
              <Link href={`/${safeLocale}/articles?page=${page + 1}`}>
                {t("next")}
                <ChevronRightIcon aria-hidden />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
      </div>
    </main>
  );
}
