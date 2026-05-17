import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";

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

  if (error) {
    console.error("[articles list] fetch failed:", error.message);
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-sm text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as ArticleRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const title = pickTitle(row, safeLocale);
            const body = pickBody(row, safeLocale);
            const category = pickCategory(row, safeLocale);
            const preview = snippet(body, SNIPPET_MAX);
            const dateLabel = row.published_at
              ? new Date(row.published_at).toLocaleDateString(
                  safeLocale === "ja"
                    ? "ja-JP"
                    : safeLocale === "tl"
                      ? "tl-PH"
                      : "en-US",
                )
              : "";
            return (
              <li key={row.id}>
                <Link
                  href={`/${safeLocale}/articles/${row.slug}`}
                  className="block rounded-md border border-border bg-card px-4 py-4 hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    {category && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {category}
                      </span>
                    )}
                    {dateLabel && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {dateLabel}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-semibold leading-snug">
                    {title}
                  </h2>
                  {preview && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {preview}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-between border-t border-border pt-4 text-sm">
          {hasPrev ? (
            <Link
              href={`/${safeLocale}/articles?page=${page - 1}`}
              className="text-primary hover:underline"
            >
              ← {t("prev")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {t("pageOf", { page, total: totalPages })}
          </span>
          {hasNext ? (
            <Link
              href={`/${safeLocale}/articles?page=${page + 1}`}
              className="text-primary hover:underline"
            >
              {t("next")} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
