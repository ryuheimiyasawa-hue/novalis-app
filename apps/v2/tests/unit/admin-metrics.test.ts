import { describe, expect, it, vi } from "vitest";
import { getMetrics } from "@/lib/admin/metrics";

// Minimal stub of the Supabase JS query builder. Every filter method
// (gte, eq, in, order, limit, select) returns a chain that is also a
// thenable, so it can be either further chained or awaited. The
// `resolve` callback computes the final payload from the accumulated
// filter state — that lets one stub answer count queries, list queries,
// and hydration joins with table-specific logic.
interface QueryState {
  table: string;
  isCount: boolean;
  filters: Array<{ kind: "gte" | "eq" | "in"; col: string; val: unknown }>;
  limit?: number;
}

type Resolver = (s: QueryState) => unknown;

function makeChain(state: QueryState, resolve: Resolver) {
  const chain: Record<string, unknown> = {
    select(
      _cols?: string,
      opts?: { count?: string; head?: boolean },
    ) {
      state.isCount = opts?.head === true;
      return chain;
    },
    gte(col: string, val: unknown) {
      state.filters.push({ kind: "gte", col, val });
      return chain;
    },
    eq(col: string, val: unknown) {
      state.filters.push({ kind: "eq", col, val });
      return chain;
    },
    in(col: string, val: unknown) {
      state.filters.push({ kind: "in", col, val });
      return chain;
    },
    order() {
      return chain;
    },
    limit(n: number) {
      state.limit = n;
      return chain;
    },
    then(onResolve: (v: unknown) => void) {
      onResolve(resolve(state));
    },
  };
  return chain;
}

function makeAdmin(opts: {
  users?: Array<{ id: string; created_at: string; is_anonymous?: boolean }>;
  conversationCount?: number;
  userMsgCount?: number;
  asstMsgCount?: number;
  escCount?: number;
  recentConversations?: Array<{
    id: string;
    created_at: string;
    mode: "auto" | "operator";
    title: string | null;
    user_id: string;
  }>;
  messageRows?: Array<{ conversation_id: string }>;
  profileRows?: Array<{ id: string; display_name: string }>;
  forceTableError?: string;
}) {
  function resolve(s: QueryState): unknown {
    if (opts.forceTableError) {
      if (s.isCount) return { count: null, error: new Error("boom") };
      return { data: null, error: new Error("boom") };
    }
    if (s.table === "conversations") {
      if (s.isCount) return { count: opts.conversationCount ?? 0, error: null };
      // recent list
      return { data: opts.recentConversations ?? [], error: null };
    }
    if (s.table === "messages") {
      if (s.isCount) {
        const eqs = s.filters.filter((f) => f.kind === "eq");
        const role = eqs.find((f) => f.col === "role")?.val;
        const esc = eqs.find((f) => f.col === "is_escalated")?.val;
        if (role === "user") return { count: opts.userMsgCount ?? 0, error: null };
        if (role === "assistant")
          return { count: opts.asstMsgCount ?? 0, error: null };
        if (esc === true) return { count: opts.escCount ?? 0, error: null };
        return { count: 0, error: null };
      }
      // hydration list
      return { data: opts.messageRows ?? [], error: null };
    }
    if (s.table === "profiles") {
      return { data: opts.profileRows ?? [], error: null };
    }
    throw new Error(`unexpected table: ${s.table}`);
  }

  return {
    from(table: string) {
      return makeChain(
        { table, isCount: false, filters: [] },
        resolve,
      );
    },
    auth: {
      admin: {
        listUsers: vi.fn(async () => {
          if (opts.forceTableError) {
            return {
              data: { users: [] },
              error: new Error("auth boom"),
            };
          }
          return { data: { users: opts.users ?? [] }, error: null };
        }),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getMetrics", () => {
  it("aggregates counts and hydrates recent conversations", async () => {
    const now = new Date("2026-05-27T12:00:00Z");
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const insideWindow = new Date(since.getTime() + 60_000).toISOString();
    const outsideWindow = new Date(since.getTime() - 60_000).toISOString();

    const admin = makeAdmin({
      conversationCount: 7,
      userMsgCount: 12,
      asstMsgCount: 12,
      escCount: 1,
      recentConversations: [
        {
          id: "c1",
          created_at: insideWindow,
          mode: "auto",
          title: "Visa renewal",
          user_id: "u1",
        },
        {
          id: "c2",
          created_at: insideWindow,
          mode: "auto",
          title: null,
          user_id: "u2",
        },
      ],
      messageRows: [
        { conversation_id: "c1" },
        { conversation_id: "c1" },
        { conversation_id: "c1" },
        { conversation_id: "c2" },
      ],
      profileRows: [
        { id: "u1", display_name: "Maria" },
        { id: "u2", display_name: "Guest" },
      ],
      users: [
        { id: "u1", created_at: insideWindow, is_anonymous: false },
        { id: "u2", created_at: insideWindow, is_anonymous: true },
        { id: "u3", created_at: insideWindow, is_anonymous: true },
        { id: "u_old", created_at: outsideWindow, is_anonymous: false },
      ],
    });

    const m = await getMetrics(admin, now);

    expect(m.windowHours).toBe(24);
    expect(m.newConversations).toBe(7);
    expect(m.newMessages).toEqual({ user: 12, assistant: 12 });
    expect(m.escalations).toBe(1);
    expect(m.newUsers).toEqual({ anon: 2, permanent: 1 });
    expect(m.recentConversations).toHaveLength(2);
    expect(m.recentConversations[0]).toMatchObject({
      id: "c1",
      title: "Visa renewal",
      displayName: "Maria",
      messageCount: 3,
    });
    expect(m.recentConversations[1]).toMatchObject({
      id: "c2",
      title: null,
      displayName: "Guest",
      messageCount: 1,
    });
  });

  it("falls back to zeros when the underlying queries error", async () => {
    const admin = makeAdmin({ forceTableError: "all" });
    const m = await getMetrics(admin);
    expect(m.newConversations).toBe(0);
    expect(m.newMessages).toEqual({ user: 0, assistant: 0 });
    expect(m.escalations).toBe(0);
    expect(m.newUsers).toEqual({ anon: 0, permanent: 0 });
    expect(m.recentConversations).toEqual([]);
  });
});
