import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAdminClient } from "@/lib/supabase/admin";
import { routing } from "@/lib/i18n/routing";
import { parseVideo, buildEmbedUrl } from "@/lib/articles/video";
import { ArrowLeftIcon, CalendarIcon, MessagesSquareIcon } from "lucide-react";
import { HomeLink } from "@/components/layout/home-link";

// Minimum-viable article detail page. Renders the markdown body of a
// published article so chat citations like /[locale]/articles/<slug>
// resolve to real content. Phase 2 will add:
//   - SEO meta / OGP
//   - the public /articles listing
//   - category filters / related-article suggestions
//   - hreflang for cross-locale variants

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

interface ArticleRow {
  slug: string;
  status: string;
  title_ja: string;
  title_en: string | null;
  title_tl: string | null;
  body_ja: string;
  body_en: string | null;
  body_tl: string | null;
  published_at: string | null;
  video_url: string | null;
  video_provider: string | null;
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
function pickCategoryName(
  a: ArticleRow,
  locale: "ja" | "en" | "tl",
): string | null {
  if (!a.category) return null;
  if (locale === "en") return a.category.name_en ?? a.category.name_ja;
  if (locale === "tl") return a.category.name_tl ?? a.category.name_ja;
  return a.category.name_ja;
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { locale, slug } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";

  // Slug shape check: keep tight enough to refuse exotic input but
  // permissive enough for the seed (which includes underscores via
  // Lesson 11). 80-char cap mirrors the SlugSchema bound.
  if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    notFound();
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select(
      "slug, status, title_ja, title_en, title_tl, body_ja, body_en, body_tl, published_at, video_url, video_provider, category:categories(slug, name_ja, name_en, name_tl)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[articles/[slug]] db error:", error.message);
    notFound();
  }
  if (!data) notFound();
  const article = data as unknown as ArticleRow;

  const title = pickTitle(article, safeLocale);
  const body = pickBody(article, safeLocale);
  const categoryName = pickCategoryName(article, safeLocale);
  // Optional video embed: only render when both the provider and URL
  // parse to a known shape. Editors might paste a broken URL — better
  // to silently drop than to surface a broken iframe.
  const video = parseVideo(article.video_provider, article.video_url);
  const tArticles = await getTranslations({
    locale: safeLocale,
    namespace: "articlesList",
  });

  return (
    <main id="main-content" className="mx-auto w-full max-w-[728px] flex-1 px-4 py-10 md:px-6 md:py-16">
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <HomeLink locale={safeLocale} />
        <Link
          href={`/${safeLocale}/articles`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9"
        >
          <ArrowLeftIcon className="size-4" strokeWidth={1.75} aria-hidden />
          {tArticles("title")}
        </Link>
        <Link
          href={`/${safeLocale}/chat`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:min-h-9"
        >
          <MessagesSquareIcon className="size-4" strokeWidth={1.75} aria-hidden />
          {safeLocale === "ja" ? "チャットに戻る" : safeLocale === "tl" ? "Bumalik sa chat" : "Back to chat"}
        </Link>
      </div>
      <header className="mb-8 space-y-3 border-b border-border pb-6">
        {categoryName && (
          <p>
            <span className="inline-flex rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
              {categoryName}
            </span>
          </p>
        )}
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {article.published_at && (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarIcon className="size-4" strokeWidth={1.75} aria-hidden />
            {new Date(article.published_at).toLocaleDateString(
              safeLocale === "ja" ? "ja-JP" : safeLocale === "tl" ? "tl-PH" : "en-US",
            )}
          </p>
        )}
      </header>
      {video && (
        <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg border border-border bg-foreground">
          <iframe
            src={buildEmbedUrl(video)}
            title={title}
            loading="lazy"
            allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full"
          />
        </div>
      )}
      {/*
        prose styles: rely on shadcn's default typography here — the
        body has Heading 2 / lists / bold runs that Tailwind handles
        without @tailwindcss/typography by leaning on whitespace and
        the base font. Switching to the typography plugin is a Phase 2
        cleanup once the public articles list lands.
      */}
      <article className="max-w-[680px] space-y-5 text-base [&_blockquote]:border-l-[3px] [&_blockquote]:border-highlight [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-sm [&_hr]:border-border [&_strong]:font-bold [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          // No rehype-raw — we intentionally do NOT enable HTML
          // passthrough. Admin-authored markdown could be edited by a
          // future editor role; treating it as plain markdown keeps
          // the surface narrow (see Lesson 14, security § AI-generated
          // code).
          skipHtml
          components={{
            // The page title is the only h1; a "#" heading in the body is
            // shown one level down so the outline stays in order.
            h1: ({ children }) => (
              <h2 className="mt-10 text-2xl font-bold">{children}</h2>
            ),
            h2: ({ children }) => (
              <h2 className="mt-10 border-l-[3px] border-highlight pl-3 text-xl font-bold">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-6 text-base font-bold">{children}</h3>
            ),
            ul: ({ children }) => (
              <ul className="list-disc space-y-2 pl-6 marker:text-primary">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal space-y-2 pl-6 marker:text-primary">{children}</ol>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                className="font-medium break-words text-primary underline underline-offset-4 hover:text-primary-hover [overflow-wrap:anywhere]"
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            ),
          }}
        >
          {body}
        </ReactMarkdown>
      </article>
    </main>
  );
}
