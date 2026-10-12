import { promises as fs } from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { CURRENT_PRIVACY_VERSION } from "@/lib/legal/versions";
import Link from "next/link";
import { FileTextIcon } from "lucide-react";
import { IconTile } from "@/components/layout/icon-tile";
import { cn } from "@/lib/utils/cn";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? (locale as "ja" | "en" | "tl")
    : (routing.defaultLocale as "ja" | "en" | "tl");
  setRequestLocale(safeLocale);

  const t = await getTranslations({ locale: safeLocale, namespace: "legal" });
  const tFooter = await getTranslations({ locale: safeLocale, namespace: "footer" });

  const filePath = path.join(
    process.cwd(),
    "public",
    "legal",
    `privacy-${CURRENT_PRIVACY_VERSION}-${safeLocale}.md`,
  );
  const content = await fs.readFile(filePath, "utf8");

  const docs = [
    { key: "terms", href: `/${safeLocale}/legal/terms`, label: t("termsTitle") },
    { key: "privacy", href: `/${safeLocale}/legal/privacy`, label: t("privacyTitle") },
  ] as const;

  return (
    <main id="main-content" className="mx-auto w-full max-w-[728px] flex-1 px-4 py-10 md:px-6 md:py-16">
      <nav aria-label={tFooter("legalHeading")} className="mb-8">
        <ul className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-card p-1">
          {docs.map((doc) => (
            <li key={doc.key}>
              <Link
                href={doc.href}
                aria-current={doc.key === "privacy" ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-[8px] px-3 text-sm font-medium lg:min-h-9",
                  doc.key === "privacy"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {doc.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <header className="mb-10 flex items-start gap-4 border-b border-border pb-8">
        <IconTile icon={FileTextIcon} size="lg" />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">{t("privacyTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {tFooter("operator")} · v{CURRENT_PRIVACY_VERSION}
          </p>
        </div>
      </header>
      <article className="max-w-[680px] space-y-4 text-base [&_a]:font-medium [&_a]:break-all [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:border-l-[3px] [&_h2]:border-highlight [&_h2]:pl-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_strong]:font-bold [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:bg-card [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:align-top [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            // The document opens with its own "#" title, which repeats the
            // page h1 above; keep it for assistive tech without a second
            // visible (and second level-one) heading.
            h1: ({ children }) => <p className="sr-only">{children}</p>,
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </main>
  );
}
