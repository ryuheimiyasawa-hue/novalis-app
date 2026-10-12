// Server page contract checks with synthetic rows. These assert shell keys
// and ownership/hydration, not a real Next browser history transition.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const h = vi.hoisted(() => ({ owner: "synthetic-user", from: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: async () => ({ id: "synthetic-user" }) }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ from: h.from }) }));
import ChatPage from "@/app/[locale]/(authed)/chat/page";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatConversationActionsProvider } from "@/components/chat/conversation-actions";
import { ConversationsSidebar } from "@/app/[locale]/(authed)/chat/sidebar";

const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}
async function page(id?: string) {
  return ChatPage({ params: Promise.resolve({ locale: "ja" }), searchParams: Promise.resolve({ conversation_id: id }) });
}
function shell(tree: ReactNode) {
  return nodes(tree).find(n => n.type === ChatShell)!;
}
beforeEach(() => {
  h.owner = "synthetic-user"; vi.clearAllMocks();
  h.from.mockImplementation((table: string) => {
    let id = "";
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => { id = value; return query; },
      order: () => query,
      maybeSingle: async () => ({ data: { id, user_id: h.owner }, error: null }),
      limit: async () => ({ data: [{
        id: `${id}-message`, role: "assistant", content: `history ${id}`,
        citations: [], is_escalated: false, created_at: "2026-10-01T00:00:00Z",
      }], error: null }),
    };
    if (!["messages", "conversations"].includes(table)) throw new Error("Unexpected synthetic table");
    return query;
  });
});

describe("Chat page navigation and initial state contract", () => {
  it("A → B → A gives distinct remount keys and the matching historical messages", async () => {
    const shells = [shell(await page(A)), shell(await page(B)), shell(await page(A))];
    expect(shells.map(s => s.key)).toEqual([A, B, A]);
    expect(shells.map(s => s.props.initialMessages)).toEqual([A, B, A].map(id => [expect.objectContaining({ content: `history ${id}` })]));
  });
  it("a fresh page supplies one shared reset provider around desktop, mobile and shell", async () => {
    const tree = await page();
    expect(tree.type).toBe(ChatConversationActionsProvider);
    expect(shell(tree).key).toBe("new");
    expect(shell(tree).props.initialConversationId).toBeUndefined();
    expect(nodes(tree).filter(n => n.type === ConversationsSidebar)).toHaveLength(2);
    expect(h.from).not.toHaveBeenCalled();
  });
  it("an invalid conversation id starts fresh without querying historical data", async () => {
    expect(shell(await page("invalid-id")).key).toBe("new");
    expect(h.from).not.toHaveBeenCalled();
  });
  it("another user's conversation is never hydrated", async () => {
    h.owner = "another-synthetic-user";
    const result = shell(await page(A));
    expect(result.key).toBe("new"); expect(result.props.initialMessages).toBeUndefined();
    expect(h.from).toHaveBeenCalledExactlyOnceWith("conversations");
  });
});
