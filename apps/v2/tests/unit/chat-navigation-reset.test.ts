// Port-free diagnostics. Actual ChatShell and SSE code run with a small
// hook/effect lifecycle simulator. This does not render DOM or run Next routes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { deps?: unknown[]; cleanup?: () => void; create: () => void | (() => void) };
const h = vi.hoisted(() => ({
  slots: [] as Array<{ value: unknown }>,
  cursor: 0,
  effects: new Map<number, Effect>(),
  pending: new Map<number, Effect>(),
  writes: [] as number[],
  replace: vi.fn(), push: vi.fn(), refresh: vi.fn(),
  reset: null as null | (() => void), contextEnabled: true,
  registerReset: vi.fn(), requestReset: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useContext: () => h.contextEnabled ? ({ registerReset: h.registerReset, reset: h.requestReset }) : null,
    useState: (initial: unknown) => {
      const i = h.cursor++;
      if (!h.slots[i]) h.slots[i] = { value: typeof initial === "function" ? (initial as () => unknown)() : initial };
      const slot = h.slots[i]!;
      return [slot.value, (next: unknown) => {
        h.writes.push(i);
        slot.value = typeof next === "function" ? (next as (v: unknown) => unknown)(slot.value) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const i = h.cursor++;
      if (!h.slots[i]) h.slots[i] = { value: { current: initial } };
      return h.slots[i]!.value;
    },
    useEffect: (create: Effect["create"], deps?: unknown[]) => {
      const i = h.cursor++;
      const old = h.effects.get(i);
      const same = old && deps && old.deps && deps.length === old.deps.length && deps.every((v, j) => Object.is(v, old.deps![j]));
      if (!same) h.pending.set(i, { create, deps });
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: h.push, refresh: h.refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key === "newButton" ? "new" : key }));
vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: async () => ({ id: "synthetic-user" }) }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ from: () => {
  const query = { data: [], error: null, select: () => query, eq: () => query, order: () => query, limit: () => query };
  return query;
} }) }));
import { ChatShell } from "@/components/chat/ChatShell";
import { ConversationsSidebar } from "@/app/[locale]/(authed)/chat/sidebar";
import { MobileSidebar } from "@/app/[locale]/(authed)/chat/mobile-sidebar";
import { NewConversationLink } from "@/components/chat/NewConversationLink";
import { ChatConversationActionsProvider } from "@/components/chat/conversation-actions";
import { toast } from "sonner";
import type { ReactElement, ReactNode } from "react";

const labels = {
  title: "AI", subtitle: "subtitle", newConversation: "new", inputPlaceholder: "input",
  send: "send", thinking: "thinking", errorRetry: "retry", errorGeneric: "error",
  errorQuota: "quota", errorAuth: "auth", expertHeading: "experts", expertSchedule: "book",
  contactCta: "contact", escalationContinue: "continue", escalationRecommend: "recommend",
  citationsHeading: "citations", backToDashboard: "back", languageLabel: "language",
  youLabel: "you", assistantLabel: "assistant", systemLabel: "system", operatorLabel: "operator",
  operatorBanner: "operator mode", pollError: "poll error",
};
type NodeProps = { children?: ReactNode; onClick?: () => Promise<void> | void; onChange?: (e: { target: { value: string } }) => void; placeholder?: string; disabled?: boolean; content?: string };
function nodes(node: ReactNode): Array<ReactElement<NodeProps>> {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<NodeProps>;
  return [el, ...nodes(el.props.children)];
}
function commitEffects() {
  for (const [i, e] of h.pending) {
    h.effects.get(i)?.cleanup?.();
    const cleanup = e.create();
    h.effects.set(i, { ...e, cleanup: typeof cleanup === "function" ? cleanup : undefined });
  }
  h.pending.clear();
}
function render() {
  h.cursor = 0;
  const result = nodes(ChatShell({ locale: "ja", labels }));
  commitEffects();
  return result;
}
function unmount() {
  for (const e of h.effects.values()) e.cleanup?.();
  h.effects.clear();
  h.pending.clear();
}
const input = () => render().find((n) => n.props.placeholder === "input")!.props;
const button = (text: string) => render().find((n) => n.props.children === text && n.props.onClick)!.props;
const fill = (text: string) => input().onChange!({ target: { value: text } });
const shows = (text: string) => render().some((n) => n.props.content === text);
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const CID = "22222222-2222-4222-8222-222222222222";
function sse(text: string) {
  const events = [{ type: "meta", conversationId: CID, period: "2026-10" }, { type: "token", text }, { type: "done", kind: "answer", text, disclaimer: "", citations: [], meta: {} }];
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 40; i++) { if (predicate()) return; await Promise.resolve(); }
  throw new Error("Expected asynchronous handler did not run");
}
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.effects.clear(); h.pending.clear(); h.writes = [];
  vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useFakeTimers();
  h.contextEnabled = true; h.reset = null;
  h.registerReset.mockImplementation((reset: () => void) => {
    h.reset = reset;
    return () => { if (h.reset === reset) h.reset = null; };
  });
  h.requestReset.mockImplementation(() => {
    if (!h.reset) return false;
    h.reset(); return true;
  });
});
afterEach(() => { unmount(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ChatShell lifecycle and cancellation; actual handlers, simulated effect commits", () => {
  it("ignores an old poll response immediately after reset, before effect cleanup commits", async () => {
    const poll = deferred<Response>();
    const f = vi.fn().mockResolvedValueOnce(sse("old answer")).mockReturnValueOnce(poll.promise);
    vi.stubGlobal("fetch", f);
    render(); fill("old question"); await button("send").onClick!();
    render();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f).toHaveBeenCalledTimes(2);
    // Invoke reset without rendering/committing its effects. A fetch promise
    // can settle before passive effect cleanup; the old loop is still alive.
    const reset = button("new").onClick!;
    reset();
    const writes = h.writes.length;
    poll.resolve(Response.json({ ok: true, data: {
      mode: "operator", messages: [{ id: "old-operator", role: "operator", content: "OLD_OPERATOR_POLL", created_at: "2026-10-10T00:00:00Z" }],
    } }));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(h.writes).toHaveLength(writes);
    expect(shows("OLD_OPERATOR_POLL")).toBe(false);
    expect(render().some(n => n.props.children === "operator mode")).toBe(false);
    expect(input().disabled).toBe(false);
  });

  it("unmount aborts a pending fetch and ignores a late answer without state writes", async () => {
    const d = deferred<Response>();
    const f = vi.fn(() => d.promise);
    vi.stubGlobal("fetch", f);
    render(); fill("pending");
    const pending = button("send").onClick!();
    const signal = (f.mock.calls[0] as unknown as [unknown, { signal?: AbortSignal }])[1].signal;
    unmount();
    const writes = h.writes.length;
    d.resolve(sse("late answer"));
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(h.writes).toHaveLength(writes);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("unmount during body reading ignores subsequent tokens and final events", async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { source = c; } });
    const f = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal("fetch", f);
    render(); fill("streaming");
    const pending = button("send").onClick!();
    source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "token", text: "partial" })}\n\n`));
    await until(() => shows("partial▍"));
    unmount();
    const writes = h.writes.length;
    source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", kind: "answer", text: "late", disclaimer: "", citations: [], meta: {} })}\n\n`));
    source.close(); await pending;
    expect(f.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(h.writes).toHaveLength(writes);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("mount effect cleanup then setup preserves the ability to send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse("fresh answer")));
    render();
    // Emulate Strict Mode's initial effect cleanup/setup cycle, retaining state.
    for (const e of h.effects.values()) {
      e.cleanup?.();
      const cleanup = e.create();
      e.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
    fill("fresh question"); await button("send").onClick!();
    expect(shows("fresh answer")).toBe(true);
    expect(input().disabled).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("an old rejection cannot release or detach the newer pending request", async () => {
    const old = deferred<Response>(); const fresh = deferred<Response>();
    const f = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    vi.stubGlobal("fetch", f);
    render(); fill("old"); const first = button("send").onClick!();
    button("new").onClick!(); fill("fresh"); const second = button("send").onClick!();
    old.reject(new TypeError("late old failure")); await first;
    expect(input().disabled).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    unmount();
    const writes = h.writes.length;
    expect(f.mock.calls[1]![1].signal.aborted).toBe(true);
    fresh.resolve(sse("late fresh answer")); await second;
    expect(h.writes).toHaveLength(writes);
  });

  it("a cancelled old CONSENT_REQUIRED response cannot navigate the fresh conversation", async () => {
    const d = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => d.promise));
    render(); fill("old"); const pending = button("send").onClick!();
    button("new").onClick!();
    const writes = h.writes.length;
    d.resolve(new Response(JSON.stringify({ ok: false, error: { code: "CONSENT_REQUIRED" } }), { status: 403 }));
    await pending;
    expect(h.push).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(h.writes).toHaveLength(writes);
    expect(input().disabled).toBe(false);
  });

  it("reset after partial tokens clears the old text and handles reader rejection silently", async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { source = c; } });
    const f = vi.fn().mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(sse("new answer"));
    vi.stubGlobal("fetch", f);
    render(); fill("old"); const pending = button("send").onClick!();
    source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "meta", conversationId: CID, period: "2026-10" })}\n\ndata: ${JSON.stringify({ type: "token", text: "partial" })}\n\n`));
    await until(() => shows("partial▍"));
    button("new").onClick!();
    source.error(new TypeError("reader interrupted")); await pending;
    expect(shows("partial▍")).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    fill("new"); await button("send").onClick!();
    expect(JSON.parse(f.mock.calls[1]![1].body).conversationId).toBeUndefined();
    expect(shows("new answer")).toBe(true);
  });
});


describe("Shared sidebar new-conversation action (desktop and mobile tree)", () => {
  it("clears and cancels a pending fresh thread even when the URL is already /ja/chat", async () => {
    const response = deferred<Response>();
    const f = vi.fn().mockReturnValueOnce(response.promise);
    vi.stubGlobal("fetch", f);
    render(); fill("old question"); const pending = button("send").onClick!();
    const sidebar = nodes(await ConversationsSidebar({ locale: "ja" }));
    const control = sidebar.find(n => Array.isArray(n.props.children) && n.props.children.includes("new"))!;
    const rendered = typeof control.type === "function"
      ? (control.type as (props: unknown) => ReactElement)(control.props)
      : control;
    const preventDefault = vi.fn();
    (rendered.props as { onNavigate?: (e: { preventDefault: () => void }) => void }).onNavigate?.({ preventDefault });
    const enabledAfterClick = !input().disabled;
    response.resolve(sse("old delayed answer")); await pending;
    expect(enabledAfterClick).toBe(true);
    expect(f.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(h.replace).toHaveBeenCalledWith("/ja/chat");
    expect(shows("old delayed answer")).toBe(false);
    f.mockResolvedValue(sse("new answer")); fill("new question"); await button("send").onClick!();
    expect(JSON.parse(f.mock.calls[1]![1].body).conversationId).toBeUndefined();
    expect(shows("new answer")).toBe(true);
  });
  it("keeps normal Link navigation available when no shell is registered", () => {
    h.contextEnabled = false;
    const link = NewConversationLink({ locale: "tl", children: "new" });
    const preventDefault = vi.fn();
    link.props.onNavigate({ preventDefault });
    expect(link.props.href).toBe("/tl/chat");
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it("an old shell cleanup cannot unregister the replacement shell", () => {
    h.cursor = 0;
    const provider = ChatConversationActionsProvider({ children: null });
    const actions = provider.props.value;
    const first = vi.fn(); const second = vi.fn();
    expect(actions.reset()).toBe(false);
    const disposeFirst = actions.registerReset(first);
    const disposeSecond = actions.registerReset(second);
    disposeFirst();
    expect(actions.reset()).toBe(true);
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
    disposeSecond(); expect(actions.reset()).toBe(false);
  });
});

describe("Mobile drawer handlers; simulated hooks and document adapters", () => {
  function drawer() {
    h.cursor = 0;
    const tree = nodes(MobileSidebar({ label: "menu", children: "sidebar" }));
    commitEffects();
    return tree;
  }
  function openDrawer() {
    const trigger = drawer().find(n => (n.props as { "aria-label"?: string })["aria-label"] === "menu")!;
    trigger.props.onClick!();
    return drawer();
  }
  function isOpen() {
    return drawer().some(n => (n.props as { role?: string }).role === "dialog");
  }
  function adapters() {
    const keys = new Map<string, (event: { key: string }) => void>();
    const style = { overflow: "scroll" };
    vi.stubGlobal("window", {
      addEventListener: (name: string, fn: (e: { key: string }) => void) => keys.set(name, fn),
      removeEventListener: (name: string) => keys.delete(name),
    });
    vi.stubGlobal("document", { body: { style } });
    return { keys, style };
  }
  it("closes for an anchor click and restores body scrolling even without a route change", () => {
    const { style } = adapters();
    const tree = openDrawer(); expect(style.overflow).toBe("hidden");
    const content = tree.find(n => n.props.children === "sidebar")!;
    (content.props.onClick as unknown as (e: unknown) => void)({ target: { closest: () => ({ tagName: "A" }) } });
    expect(isOpen()).toBe(false); expect(style.overflow).toBe("scroll");
  });
  it("keeps the drawer open for whitespace clicks", () => {
    adapters();
    const content = openDrawer().find(n => n.props.children === "sidebar")!;
    (content.props.onClick as unknown as (e: unknown) => void)({ target: { closest: () => null } });
    expect(isOpen()).toBe(true);
  });
  it("Escape closes the drawer and removes its listener", () => {
    const { keys, style } = adapters(); openDrawer();
    keys.get("keydown")!({ key: "Escape" });
    expect(isOpen()).toBe(false); expect(keys.size).toBe(0); expect(style.overflow).toBe("scroll");
  });
  it("can close and reopen repeatedly, then restore scrolling on unmount", () => {
    const { style } = adapters();
    for (let i = 0; i < 3; i++) {
      const close = openDrawer().find(n => (n.props as { "aria-label"?: string })["aria-label"] === "Close")!;
      close.props.onClick!(); expect(isOpen()).toBe(false);
    }
    openDrawer(); unmount(); expect(style.overflow).toBe("scroll");
  });
});
