import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RecentConversation {
  id: string;
  createdAt: string;
  mode: "auto" | "operator";
  title: string | null;
  displayName: string;
  messageCount: number;
}

export interface MetricsResult {
  windowHours: number;
  newUsers: { anon: number; permanent: number };
  newConversations: number;
  newMessages: { user: number; assistant: number };
  escalations: number;
  recentConversations: RecentConversation[];
}

// Build a 24h Observability snapshot from a fresh service-role client.
// Pure read-only; called from /admin/metrics server component on every
// render (no caching) so the operator always sees current data.
//
// Anon vs permanent split for newUsers uses auth.admin.listUsers — the
// is_anonymous flag is on auth.users, not profiles, and PostgREST does
// not expose the auth schema. listUsers pages 1000 at a time which is
// fine while the project is small. If the project ever scales past
// thousands of users per day, swap this for a SECURITY DEFINER RPC.
export async function getMetrics(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<MetricsResult> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();

  const [usersByFlag, convCount, userMsgCount, asstMsgCount, escCount, recent] =
    await Promise.all([
      countNewUsersByFlag(admin, since),
      countSince(admin, "conversations", since),
      countSince(admin, "messages", since, { column: "role", value: "user" }),
      countSince(admin, "messages", since, {
        column: "role",
        value: "assistant",
      }),
      countSince(admin, "messages", since, {
        column: "is_escalated",
        value: true,
      }),
      fetchRecentConversations(admin, 20),
    ]);

  return {
    windowHours: 24,
    newUsers: usersByFlag,
    newConversations: convCount,
    newMessages: { user: userMsgCount, assistant: asstMsgCount },
    escalations: escCount,
    recentConversations: recent,
  };
}

async function countSince(
  admin: SupabaseClient<Database>,
  table: "conversations" | "messages",
  since: string,
  filter?: { column: string; value: string | boolean },
): Promise<number> {
  let query = admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);
  if (filter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).eq(filter.column, filter.value);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`[metrics] countSince(${table}) failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function countNewUsersByFlag(
  admin: SupabaseClient<Database>,
  since: string,
): Promise<{ anon: number; permanent: number }> {
  // listUsers returns the most recently created users first across all
  // pages, so a single page=1, perPage=1000 fetch is enough as long as
  // daily signups stay below 1000. Filtering by created_at happens
  // client-side because the Admin API has no since-filter param.
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    console.error("[metrics] listUsers failed:", error.message);
    return { anon: 0, permanent: 0 };
  }
  const sinceMs = new Date(since).getTime();
  let anon = 0;
  let permanent = 0;
  for (const u of data.users) {
    if (new Date(u.created_at).getTime() < sinceMs) continue;
    if (u.is_anonymous) anon += 1;
    else permanent += 1;
  }
  return { anon, permanent };
}

interface ConvRow {
  id: string;
  created_at: string;
  mode: "auto" | "operator";
  title: string | null;
  user_id: string;
}

async function fetchRecentConversations(
  admin: SupabaseClient<Database>,
  limit: number,
): Promise<RecentConversation[]> {
  const { data: convs, error: convErr } = await admin
    .from("conversations")
    .select("id, created_at, mode, title, user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (convErr || !convs || convs.length === 0) {
    if (convErr) {
      console.error("[metrics] recent conversations failed:", convErr.message);
    }
    return [];
  }
  const rows = convs as ConvRow[];
  const ids = rows.map((c) => c.id);
  const userIds = Array.from(new Set(rows.map((c) => c.user_id)));

  const [{ data: msgs }, { data: profiles }] = await Promise.all([
    admin.from("messages").select("conversation_id").in("conversation_id", ids),
    admin.from("profiles").select("id, display_name").in("id", userIds),
  ]);

  const msgCountByConv = new Map<string, number>();
  for (const m of (msgs ?? []) as Array<{ conversation_id: string }>) {
    msgCountByConv.set(
      m.conversation_id,
      (msgCountByConv.get(m.conversation_id) ?? 0) + 1,
    );
  }
  const nameByUser = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; display_name: string }>) {
    nameByUser.set(p.id, p.display_name);
  }

  return rows.map((c) => ({
    id: c.id,
    createdAt: c.created_at,
    mode: c.mode,
    title: c.title,
    displayName: nameByUser.get(c.user_id) ?? "(unknown)",
    messageCount: msgCountByConv.get(c.id) ?? 0,
  }));
}
