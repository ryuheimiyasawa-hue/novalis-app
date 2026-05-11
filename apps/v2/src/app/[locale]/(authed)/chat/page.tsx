import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { ChatShell } from "@/components/chat/ChatShell";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }>;
}

// Web chat page. (authed)/layout.tsx already enforces requireAuth();
// here we just resolve the locale, pull the i18n labels, and hand
// everything to the client shell.
export default async function ChatPage({ params }: Props) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";

  const t = await getTranslations({ locale: safeLocale, namespace: "chat.ui" });

  return (
    <ChatShell
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
        noExperts: t("noExperts"),
        citationsHeading: t("citationsHeading"),
        youLabel: t("youLabel"),
        assistantLabel: t("assistantLabel"),
        systemLabel: t("systemLabel"),
      }}
    />
  );
}
