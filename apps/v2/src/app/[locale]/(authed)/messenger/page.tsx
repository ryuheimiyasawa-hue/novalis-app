import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { HomeIcon, MessageCircleIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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
    <main id="main-content" className="mx-auto w-full max-w-[680px] flex-1 px-4 py-10 md:px-6 md:py-16">
      <div className="mb-6">
        <Link
          href={`/${safeLocale}/dashboard`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent lg:min-h-9"
        >
          <HomeIcon className="size-4" strokeWidth={1.75} aria-hidden />
          {t("backToDashboard")}
        </Link>
      </div>
      <PageHeader
        icon={MessageCircleIcon}
        title={t("title")}
        description={t("subtitle")}
      />

      <MessengerLinkClient
        labels={labels}
        pageUrl={process.env.NEXT_PUBLIC_MESSENGER_PAGE_URL || undefined}
      />
    </main>
  );
}
