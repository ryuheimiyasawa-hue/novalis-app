import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";

// Contact page (MVP-E). Embeds the Novalis Google Form so beta users
// can reach a human after escalation. Google Form handles notifications
// + Sheet capture — no DB table, no admin UI. Phase 2 will migrate to
// a first-party inquiries table once form volume justifies it.
//
// The form URL comes from NEXT_PUBLIC_CONTACT_FORM_URL. When unset
// (dev / preview without the env var) we render a placeholder so the
// page still works as a CTA target without throwing.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  setRequestLocale(safeLocale);

  const t = await getTranslations({ locale: safeLocale, namespace: "contact" });

  // Optional embed URL. Google Form's /viewform endpoint accepts an
  // ?embedded=true param that removes the outer chrome.
  const rawUrl = process.env.NEXT_PUBLIC_CONTACT_FORM_URL ?? "";
  const embedUrl =
    rawUrl &&
    (rawUrl.includes("?")
      ? `${rawUrl}&embedded=true`
      : `${rawUrl}?embedded=true`);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-4 text-sm">
        <Link
          href={`/${safeLocale}/dashboard`}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
      </nav>
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {embedUrl ? (
        <div className="overflow-hidden rounded-md border border-border bg-white">
          <iframe
            src={embedUrl}
            title={t("title")}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[1600px] w-full"
          >
            {t("loading")}
          </iframe>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          {t("notConfigured")}
        </div>
      )}
    </main>
  );
}
