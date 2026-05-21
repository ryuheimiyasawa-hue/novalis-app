import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

// Past-conversations sidebar (replaces the standalone /conversations
// page). Rendered server-side from the same chat route so the initial
// HTML already includes the list — no client fetch, no skeleton flash.
// Active highlight is derived from props (the chat page passes the
// current conversation_id from searchParams), so this stays a server
// component with zero client state.

interface Props {
  locale: "ja" | "en" | "tl";
  /** Active conversation id from the chat page's URL searchParams.
   *  When present, the matching row gets a highlight. */
  activeConversationId?: string;
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

export async function ConversationsSidebar({
  locale,
  activeConversationId,
}: Props) {
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
        ) : rows.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => {
              const isActive = row.id === activeConversationId;
              const snippet = row.messages?.[0]?.content ?? "";
              const displayTitle =
                row.title?.trim() ||
                (snippet ? truncate(snippet, SNIPPET_MAX) : t("untitled"));
              return (
                <li key={row.id}>
                  <Link
                    href={`/${locale}/chat?conversation_id=${row.id}`}
                    className={`block rounded-md px-2 py-2 text-xs leading-tight transition-colors ${
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <div className="line-clamp-2 font-medium">
                      {displayTitle}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {formatRelative(row.updated_at, locale)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
