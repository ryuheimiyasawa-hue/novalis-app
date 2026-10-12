import Link from "next/link";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { FlaskConicalIcon, HomeIcon } from "lucide-react";
import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatConversationActionsProvider } from "@/components/chat/conversation-actions";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Citation } from "@/lib/ai/rag";
import { ConversationsSidebar } from "./sidebar";
import { MobileSidebar } from "./mobile-sidebar";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ conversation_id?: string }>;
}

const UuidSchema = z.string().uuid();

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "operator" | "system";
  content: string;
  is_escalated: boolean;
  citations: Citation[] | null;
  created_at: string;
}

interface HydratedMessage {
  id: string;
  role: "user" | "assistant" | "system" | "operator";
  content: string;
  disclaimer?: string;
  citations?: Citation[];
  escalation?: { text: string };
}

/**
 * Map a persisted message row to the shell's UiMessage shape.
 *
 *  - role: user/assistant/operator pass through. Operator rows used to
 *    be rendered as `assistant`, which attributed a staff member's words
 *    to the AI; P2-B2 gives them their own bubble. system rows are
 *    either escalation cards (is_escalated=true) or block notices.
 *  - persistence appends the disclaimer to assistant content with
 *    "\n\n" so the stored row is one self-contained string. We re-
 *    render historical assistant rows as-is (disclaimer baked into
 *    content) rather than try to split — simpler and pixel-identical
 *    to what the user originally saw.
 */
function hydrate(row: MessageRow): HydratedMessage {
  if (row.role === "system") {
    if (row.is_escalated) {
      return {
        id: row.id,
        role: "system",
        content: "",
        escalation: { text: row.content },
      };
    }
    return { id: row.id, role: "system", content: row.content };
  }
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations:
      row.citations && row.citations.length > 0 ? row.citations : undefined,
  };
}

// Web chat page. (authed)/layout.tsx already enforces requireAuth();
// here we resolve the locale, optionally hydrate a prior conversation
// from `?conversation_id=`, render the always-visible past-
// conversations sidebar (desktop) or hamburger trigger (mobile), and
// hand the shell its initial messages.
export default async function ChatPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { conversation_id } = await searchParams;

  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";

  const t = await getTranslations({ locale: safeLocale, namespace: "chat.ui" });
  const tConv = await getTranslations({
    locale: safeLocale,
    namespace: "conversations",
  });
  const tCommon = await getTranslations({
    locale: safeLocale,
    namespace: "common",
  });
  const tAnon = await getTranslations({
    locale: safeLocale,
    namespace: "anonBanner",
  });

  // Detect anonymous (signInAnonymously) users so we can show a
  // "test mode" banner at the top of the chat. The (authed) layout
  // already requires a session, so this is purely a UI affordance.
  const sessionUser = await requireAuth();
  const isAnon = sessionUser.is_anonymous === true;

  // Resolve optional conversation_id from the URL. We do the
  // ownership check + message fetch server-side so the client never
  // sees a conversation it does not own.
  let initialConversationId: string | undefined;
  let initialMessages: HydratedMessage[] | undefined;

  if (conversation_id && UuidSchema.safeParse(conversation_id).success) {
    const admin = getAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (conv && conv.user_id === sessionUser.id) {
      const { data: msgs, error } = await admin
        .from("messages")
        .select("id, role, content, is_escalated, citations, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        console.error("[chat page] hydrate fetch failed:", error.message);
      } else {
        initialConversationId = conversation_id;
        initialMessages = (msgs as MessageRow[] | null)?.map(hydrate) ?? [];
      }
    }
    // Silently fall through to a fresh shell if the conversation does
    // not exist or is not owned — we do NOT 404, because the user might
    // have manually edited the URL or arrived from a stale link.
  }

  // The sidebar is the SAME server-rendered tree on desktop and mobile;
  // mobile just wraps it in a drawer trigger. Computing it once keeps
  // the conversation fetch single-shot.
  const sidebar = <ConversationsSidebar locale={safeLocale} />;

  return (
    <ChatConversationActionsProvider>
      <div className="flex h-dvh bg-background">
        {/* Desktop sidebar — fixed 288px column, hidden on mobile. */}
        <div className="hidden w-[288px] shrink-0 md:flex md:flex-col">
          {sidebar}
        </div>

        {/* Chat area. The mobile hamburger sits at the top of this column
            and opens the same sidebar in a drawer. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {isAnon && (
            <div
              role="status"
              className="flex items-start gap-2 border-b border-highlight/40 bg-highlight-soft px-4 py-2 text-sm text-foreground"
            >
              <FlaskConicalIcon className="mt-1 size-4 shrink-0 text-highlight-soft-foreground" strokeWidth={1.75} aria-hidden />
              <p>
                <span className="font-bold text-highlight-soft-foreground">{tAnon("label")}</span>
                <span className="mx-2" aria-hidden>·</span>
                <span>{tAnon("body")}</span>
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
            <MobileSidebar label={tConv("title")} closeLabel={tCommon("close")}>
              {sidebar}
            </MobileSidebar>
            <h1 className="min-w-0 flex-1 text-base leading-tight font-bold">{t("title")}</h1>
            {/* Mobile back-to-dashboard link on the right of the header.
                The icon alone read as decoration, so the label rides with
                it — the desktop header shows the same wording. */}
            <Link
              href={`/${safeLocale}/dashboard`}
              className="inline-flex min-h-11 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-left text-sm leading-tight font-medium text-foreground hover:bg-accent"
              aria-label={t("backToDashboard")}
              title={t("backToDashboard")}
            >
              <HomeIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {t("backToDashboard")}
            </Link>
          </div>
          <div className="min-h-0 flex-1">
            <ChatShell
              // key forces ChatShell to remount when the URL conversation
              // switches — without this, switching threads in the sidebar
              // would leave the previous conversation's messages on screen
              // because ChatShell only seeds state from props on first mount.
              key={initialConversationId ?? "new"}
              locale={safeLocale}
              initialConversationId={initialConversationId}
              initialMessages={initialMessages}
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
                emptyTitle: t("emptyTitle"),
                emptyBody: t("emptyBody"),
                emptyPrivacyHint: t("emptyPrivacyHint"),
                composerHint: t("composerHint"),
                escalationTitle: t("escalationTitle"),
              }}
            />
          </div>
        </div>
      </div>
    </ChatConversationActionsProvider>
  );
}
