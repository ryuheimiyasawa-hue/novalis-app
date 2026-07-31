import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { MessengerLinkClient, type MessengerLinkLabels } from "./link-client";

// Self-serve Messenger linking (P2-K follow-up). The user issues a short code
// here and sends it to the bot; the webhook exchanges it for a messenger_links
// row. Before this page existed, links could only be created by hand in SQL.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MessengerLinkPage({ params }: PageProps) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  setRequestLocale(safeLocale);

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "messengerLink",
  });

  const labels: MessengerLinkLabels = {
    step1Title: t("step1Title"),
    step1Body: t("step1Body"),
    issueButton: t("issueButton"),
    issuing: t("issuing"),
    reissueButton: t("reissueButton"),
    step2Title: t("step2Title"),
    step2Body: t("step2Body"),
    openMessenger: t("openMessenger"),
    expiresIn: t("expiresIn", { minutes: "{minutes}" }),
    expired: t("expired"),
    step3Title: t("step3Title"),
    step3Body: t("step3Body"),
    errorGeneric: t("errorGeneric"),
    errorAnon: t("errorAnon"),
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-4">
        <Link
          href={`/${safeLocale}/dashboard`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
      </div>
      <header className="mb-8 border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <MessengerLinkClient
        labels={labels}
        pageUrl={process.env.NEXT_PUBLIC_MESSENGER_PAGE_URL || undefined}
      />
    </main>
  );
}
