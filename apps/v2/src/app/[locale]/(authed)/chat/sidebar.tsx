import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
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

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-muted/20">
      <div className="border-b border-border p-3">
        <Link
          href={`/${locale}/chat`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent/40"
        >
          <PlusIcon className="size-4" aria-hidden />
          {t("newButton")}
        </Link>
      </div>
      {/* Locale switcher at the very top, before "+ new conversation".
          Always visible on desktop sidebar; reachable on mobile via the
          hamburger drawer. Tiny so it does not crowd. */}
      <div className="border-b border-border px-3 py-2 text-xs">
        <LocaleSwitcher
          currentLocale={locale}
          label={tCommon("language")}
          className="text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {error ? (
          <p className="px-2 py-4 text-xs text-destructive">{t("loadError")}</p>
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
    </aside>
  );
}
