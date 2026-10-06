import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { QA_HARNESS_ENABLED } from "@/lib/qa/harness-flag";
import { QaChatHarness } from "./qa-chat-harness";

// Manual QA surface for the chat stream fixes (2026-10-06). It mounts the
// real ChatShell against a scripted, in-page stand-in for /api/chat/send,
// so a reviewer can try a dropped connection and a mid-request "new
// conversation" in a real browser. Nothing here reaches Supabase, Gemini,
// Messenger or the payment provider: there is no session, no fetch to the
// server, and every answer is a fixed string.
//
// It exists only where NEXT_PUBLIC_QA_HARNESS=1 is set (a preview
// deployment). Production never sets it, so this path 404s there.
export const dynamic = "force-static";

export default async function QaChatPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (!QA_HARNESS_ENABLED) notFound();

  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? (locale as "ja" | "en" | "tl")
    : (routing.defaultLocale as "ja" | "en" | "tl");
  setRequestLocale(safeLocale);

  const t = await getTranslations({ locale: safeLocale, namespace: "chat.ui" });
  const tCommon = await getTranslations({ locale: safeLocale, namespace: "common" });

  return (
    <QaChatHarness
      locale={safeLocale}
      labels={{
        title: t("title"),
        subtitle: t("subtitle"),
        newConversation: t("newConversation"),
        inputPlaceholder: t("inputPlaceholder"),
        send: t("send"),
        thinking: t("thinking"),
        errorRetry: t("errorRetry"),
        errorGeneric: t("errorGeneric"),
        errorQuota: t("errorQuota"),
        errorAuth: t("errorAuth"),
        expertHeading: t("expertHeading"),
        expertSchedule: t("expertSchedule"),
        contactCta: t("contactCta"),
        escalationContinue: t("escalationContinue"),
        escalationRecommend: t("escalationRecommend"),
        citationsHeading: t("citationsHeading"),
        backToDashboard: t("backToDashboard"),
        languageLabel: tCommon("language"),
        youLabel: t("youLabel"),
        assistantLabel: t("assistantLabel"),
        systemLabel: t("systemLabel"),
        operatorLabel: t("operatorLabel"),
        operatorBanner: t("operatorBanner"),
        pollError: t("pollError"),
      }}
    />
  );
}
