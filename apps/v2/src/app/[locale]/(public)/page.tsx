import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/config";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
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
          <button
            type="button"
            className="px-6 py-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {t("ctaPrimary")}
          </button>
          <button
            type="button"
            className="px-6 py-3 rounded-md border border-neutral-300 font-medium hover:bg-neutral-50"
          >
            {t("ctaSecondary")}
          </button>
        </div>
      </div>
    </main>
  );
}
