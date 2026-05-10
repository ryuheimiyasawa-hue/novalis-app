import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  setRequestLocale(safeLocale);
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl text-center space-y-6">
        <p className="text-sm uppercase tracking-widest text-neutral-500">
          {tApp("name")}
        </p>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">
          {t("title")}
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-300">
          {t("subtitle")}
        </p>
        <div className="flex gap-3 justify-center pt-4">
          <Link
            href={`/${safeLocale}/login`}
            className="px-6 py-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href={`/${safeLocale}/legal/terms`}
            className="px-6 py-3 rounded-md border border-neutral-300 font-medium hover:bg-neutral-50"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </div>
    </main>
  );
}
