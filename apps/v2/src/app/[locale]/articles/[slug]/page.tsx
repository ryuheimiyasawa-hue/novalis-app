import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAdminClient } from "@/lib/supabase/admin";
import { routing } from "@/lib/i18n/routing";
import { parseVideo, buildEmbedUrl } from "@/lib/articles/video";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

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
  const tCommon = await getTranslations({
    locale: safeLocale,
    namespace: "common",
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link
          href={`/${safeLocale}/chat`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← {safeLocale === "ja" ? "チャットに戻る" : safeLocale === "tl" ? "Bumalik sa chat" : "Back to chat"}
        </Link>
        <LocaleSwitcher
          currentLocale={safeLocale}
          label={tCommon("language")}
        />
      </div>
      <header className="mb-6 space-y-2 border-b border-border pb-4">
        {categoryName && (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {categoryName}
          </p>
        )}
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {article.published_at && (
          <p className="text-xs text-muted-foreground">
            {new Date(article.published_at).toLocaleDateString(
              safeLocale === "ja" ? "ja-JP" : safeLocale === "tl" ? "tl-PH" : "en-US",
            )}
          </p>
        )}
      </header>
      {video && (
        <div className="mb-6 aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
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
      <article className="space-y-4 text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          // No rehype-raw — we intentionally do NOT enable HTML
          // passthrough. Admin-authored markdown could be edited by a
          // future editor role; treating it as plain markdown keeps
          // the surface narrow (see Lesson 14, security § AI-generated
          // code).
          skipHtml
          components={{
            h2: ({ children }) => (
              <h2 className="mt-6 text-lg font-semibold">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-4 text-base font-semibold">{children}</h3>
            ),
            ul: ({ children }) => (
              <ul className="list-disc space-y-1 pl-6">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal space-y-1 pl-6">{children}</ol>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-primary underline-offset-2 hover:underline"
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
