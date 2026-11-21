import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/config";
import { Toaster } from "@/components/ui/sonner";
import { LangSync } from "./lang-sync";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale as Locale);

  return (
    <NextIntlClientProvider locale={locale}>
      <LangSync locale={locale} />
      {/* Server-rendered locale hook for the body font and line height
          (see globals.css [data-locale]). `contents` keeps it out of the
          layout; doing this in LangSync would flash the Japanese stack
          before hydration. */}
      <div data-locale={locale} lang={locale} className="contents">
        {children}
        {/* Host for the toast.error() calls the chat and conversation list
            already make; without it those messages were never shown. */}
        <Toaster position="top-center" closeButton />
      </div>
    </NextIntlClientProvider>
  );
}
