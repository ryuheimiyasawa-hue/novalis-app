import { NewConversationLink } from "@/components/chat/NewConversationLink";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CircleAlertIcon, PlusIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  ConversationList,
  type SidebarConversation,
} from "./conversation-list";

// Past-conversations sidebar (replaces the standalone /conversations
// page). Rendered server-side from the same chat route so the initial
// HTML already includes the list — no client fetch, no skeleton flash.
// Row shaping (title fallback + relative date) happens here; the
// interactive list (search / rename / delete + active highlight) is a
// client child seeded with the shaped rows.

interface Props {
  locale: "ja" | "en" | "tl";
}

interface ConversationRow {
  id: string;
  title: string | null;
  updated_at: string;
  messages: { content: string }[] | null;
}

const SNIPPET_MAX = 50;
const SIDEBAR_LIMIT = 50;

function truncate(text: string, max: number): string {
  const stripped = text.replace(/\s+/g, " ").trim();
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

/** Compact relative date for the sidebar list. Same labels as the
 *  removed /conversations page so users see familiar wording. */
function formatRelative(iso: string, locale: "ja" | "en" | "tl"): string {
  const then = new Date(iso);
  const diffDays = Math.floor(
    (Date.now() - then.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 1) return locale === "ja" ? "今日" : locale === "tl" ? "Ngayon" : "Today";
  if (diffDays < 2)
    return locale === "ja" ? "昨日" : locale === "tl" ? "Kahapon" : "Yesterday";
  if (diffDays < 7)
    return locale === "ja"
      ? `${diffDays}日前`
      : locale === "tl"
        ? `${diffDays}d`
        : `${diffDays}d`;
  return then.toISOString().slice(5, 10); // mm-dd
}

export async function ConversationsSidebar({ locale }: Props) {
  const user = await requireAuth();
  const admin = getAdminClient();

  // Same embed-with-foreign-table-limit trick as the old /conversations
  // page: pulls each conversation's first user message inline so the
  // snippet renders without an N+1 round-trip.
  const { data, error } = await admin
    .from("conversations")
    .select("id, title, updated_at, messages(content)")
    .eq("user_id", user.id)
    .eq("messages.role", "user")
    .order("created_at", { ascending: true, foreignTable: "messages" })
    .limit(1, { foreignTable: "messages" })
    .order("updated_at", { ascending: false })
    .limit(SIDEBAR_LIMIT);

  const t = await getTranslations({
    locale,
    namespace: "conversations",
  });
  const tCommon = await getTranslations({
    locale,
    namespace: "common",
  });
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tDashboard = await getTranslations({ locale, namespace: "dashboard" });

  const rows = (data ?? []) as ConversationRow[];
  const shaped: SidebarConversation[] = rows.map((row) => {
    const snippet = row.messages?.[0]?.content ?? "";
    return {
      id: row.id,
      displayTitle:
        row.title?.trim() ||
        (snippet ? truncate(snippet, SNIPPET_MAX) : t("untitled")),
      relativeDate: formatRelative(row.updated_at, locale),
    };
  });

  const footLink =
    "inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground hover:underline md:min-h-8";

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebar">
      <div className="space-y-3 border-b border-border p-4">
        <Link
          href={`/${locale}/dashboard`}
          aria-label={tNav("dashboard")}
          className="flex min-h-11 items-center gap-2.5 rounded-md"
        >
          <BrandMark className="size-8" />
          <span className="text-base font-bold">{tDashboard("headerLogo")}</span>
        </Link>
        <NewConversationLink
          locale={locale}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover"
        >
          <PlusIcon className="size-4" strokeWidth={1.75} aria-hidden />
          {t("newButton")}
        </NewConversationLink>
      </div>
      {/* Language switcher just below "+ new conversation". Always
          visible on the desktop sidebar; reachable on mobile via the
          hamburger drawer. */}
      <div className="border-b border-border px-4 py-3">
        <LocaleSwitcher
          currentLocale={locale}
          label={tCommon("language")}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="px-2 pb-2 text-xs font-bold text-muted-foreground">{t("title")}</p>
        {error ? (
          <p
            role="alert"
            className="mx-1 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>{t("loadError")}</span>
          </p>
        ) : (
          <ConversationList
            locale={locale}
            initialRows={shaped}
            labels={{
              searchPlaceholder: t("searchPlaceholder"),
              searchNoResults: t("searchNoResults"),
              empty: t("empty"),
              actionsLabel: t("actionsLabel"),
              rename: t("rename"),
              renameSave: t("renameSave"),
              renameCancel: t("renameCancel"),
              delete: t("delete"),
              deleteConfirm: t("deleteConfirm"),
              renameFailed: t("renameFailed"),
              deleteFailed: t("deleteFailed"),
            }}
          />
        )}
      </div>
      <nav
        aria-label={tNav("mainLabel")}
        className="flex flex-wrap gap-x-4 border-t border-border px-4 py-2"
      >
        <Link href={`/${locale}/contact`} className={footLink}>
          {tNav("contact")}
        </Link>
        <Link href={`/${locale}/legal/terms`} className={footLink}>
          {tDashboard("footerTerms")}
        </Link>
        <Link href={`/${locale}/legal/privacy`} className={footLink}>
          {tDashboard("footerPrivacy")}
        </Link>
      </nav>
    </aside>
  );
}
