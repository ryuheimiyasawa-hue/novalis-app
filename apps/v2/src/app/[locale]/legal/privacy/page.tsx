import { promises as fs } from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { CURRENT_PRIVACY_VERSION } from "@/lib/legal/versions";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

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
  const tCommon = await getTranslations({ locale: safeLocale, namespace: "common" });

  const filePath = path.join(
    process.cwd(),
    "public",
    "legal",
    `privacy-${CURRENT_PRIVACY_VERSION}-${safeLocale}.md`,
  );
  const content = await fs.readFile(filePath, "utf8");

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-3xl mx-auto mb-4 flex justify-end">
        <LocaleSwitcher
          currentLocale={safeLocale}
          label={tCommon("language")}
        />
      </div>
      <article className="max-w-3xl mx-auto space-y-4 leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:underline">
        <h1 className="sr-only">{t("privacyTitle")}</h1>
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </main>
  );
}
