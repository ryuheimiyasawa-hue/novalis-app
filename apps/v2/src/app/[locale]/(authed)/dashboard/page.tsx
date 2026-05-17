import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { isPaymentEnabled } from "@/lib/payment/is-payment-enabled";
import { DashboardLanguageSwitcher } from "./dashboard-language-switcher";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? (locale as "ja" | "en" | "tl")
    : (routing.defaultLocale as "ja" | "en" | "tl");
  setRequestLocale(safeLocale);

  // Auth + onboarded are already enforced by proxy.ts and (authed) layout,
  // but we still need the user to look up the profile row.
  const user = await requireAuth();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "dashboard",
  });
  const displayName = profile?.display_name ?? "";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
        <span className="font-bold text-lg">{t("headerLogo")}</span>
        <div className="flex items-center gap-4">
          <DashboardLanguageSwitcher
            currentLocale={safeLocale}
            label={t("footerLanguage")}
          />
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            {displayName}
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <section className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">
              {t("greeting", { name: displayName })}
            </h1>
            {!isPaymentEnabled() && (
              <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                {t("freeBadge")}
              </span>
            )}
          </div>

          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{t("chatCtaTitle")}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {t("chatCtaBody")}
              </p>
            </div>
            {/* "View past consultations" was previously a second CTA
                here. Replaced by the always-visible sidebar inside
                /chat itself (Phase 1 chat UX rework), so the dashboard
                only needs the entry point now. */}
            <Link
              href={`/${safeLocale}/chat`}
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              {t("chatCtaButton")}
            </Link>
          </div>

          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{t("articlesCtaTitle")}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {t("articlesCtaBody")}
              </p>
            </div>
            <Link
              href={`/${safeLocale}/articles`}
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {t("articlesCtaButton")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 py-6 border-t border-neutral-200 dark:border-neutral-800 text-sm text-neutral-500 flex justify-center gap-6">
        <Link
          href={`/${safeLocale}/legal/terms`}
          className="hover:underline"
        >
          {t("footerTerms")}
        </Link>
        <Link
          href={`/${safeLocale}/legal/privacy`}
          className="hover:underline"
        >
          {t("footerPrivacy")}
        </Link>
      </footer>
    </div>
  );
}
