import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }>;
}

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages: { content: string }[] | null;
}

const SNIPPET_MAX = 60;

function truncate(text: string, max: number): string {
  const stripped = text.replace(/\s+/g, " ").trim();
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

/** Relative date formatter — "今日 / 昨日 / N日前 / yyyy-mm-dd". Keeps
 *  the list dense without pulling in a date library. */
function formatRelative(iso: string, locale: "ja" | "en" | "tl"): string {
  const then = new Date(iso);
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now.getTime() - then.getTime()) / oneDay);
  if (diffDays < 1) return locale === "ja" ? "今日" : locale === "tl" ? "Ngayon" : "Today";
  if (diffDays < 2)
    return locale === "ja" ? "昨日" : locale === "tl" ? "Kahapon" : "Yesterday";
  if (diffDays < 7)
    return locale === "ja"
      ? `${diffDays}日前`
      : locale === "tl"
        ? `${diffDays} araw nakalipas`
        : `${diffDays}d ago`;
  return then.toISOString().slice(0, 10);
}

/**
 * Past conversations list (B). The page fetches up to 50 most-recent
 * conversations for the signed-in user, plus the FIRST user message of
 * each as a snippet. Snippet fetch uses PostgREST's foreign-table
 * limit-on-embed feature so we get the snippet inline without an
 * N+1 round-trip.
 *
 * Auth + onboarded gates are already enforced by `(authed)/layout.tsx`
 * + middleware; we still need requireAuth() here to get the user_id
 * for the ownership-scoped query.
 */
export default async function ConversationsPage({ params }: Props) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  setRequestLocale(safeLocale);

  const user = await requireAuth();
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("conversations")
    .select(
      // Embed: pull the first user message per conversation for the
      // list snippet. Foreign-table filter + order + limit narrows the
      // embed to one row each.
      `id, title, created_at, updated_at, messages(content)`,
    )
    .eq("user_id", user.id)
    .eq("messages.role", "user")
    .order("created_at", { ascending: true, foreignTable: "messages" })
    .limit(1, { foreignTable: "messages" })
    .order("updated_at", { ascending: false })
    .limit(50);

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "conversations",
  });

  if (error) {
    console.error("[conversations page] fetch failed:", error.message);
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-sm text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  const rows = (data ?? []) as ConversationRow[];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${safeLocale}/chat`}
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          {t("newButton")}
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const snippet = row.messages?.[0]?.content ?? "";
            const displayTitle =
              row.title?.trim() ||
              (snippet ? truncate(snippet, SNIPPET_MAX) : t("untitled"));
            const dateLabel = formatRelative(row.updated_at, safeLocale);
            return (
              <li key={row.id}>
                <Link
                  href={`/${safeLocale}/chat?conversation_id=${row.id}`}
                  className="block rounded-md border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="line-clamp-1 text-sm font-medium">
                      {displayTitle}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {dateLabel}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
