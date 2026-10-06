import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression tests for the two chat-stream faults found in the 2026-10-05
// verification: a network failure left the composer locked (isStreaming
// stayed true), and pressing "new conversation" during a pending request
// let the late meta/done write the abandoned thread's answer and
// conversation id into the fresh one.
//
// The technique comes from that verification's diagnostic: React's hooks
// are simulated so the real ChatShell handlers and the real SSE consumer
// run without a DOM, a browser or a port. It covers event handling, NOT
// rendering — browser-level checks belong in E2E.

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value: unknown }>,
  cursor: 0,
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = h.cursor++;
      if (!h.slots[i]) {
        h.slots[i] = {
          value: typeof initial === "function" ? (initial as () => unknown)() : initial,
        };
      }
      return [
        h.slots[i]!.value,
        (next: unknown) => {
          h.slots[i]!.value =
            typeof next === "function"
              ? (next as (v: unknown) => unknown)(h.slots[i]!.value)
              : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = h.cursor++;
      if (!h.slots[i]) h.slots[i] = { value: { current: initial } };
      return h.slots[i]!.value;
    },
    // Effects do not run under simulated hooks; only the slot is consumed.
    useEffect: () => {
      h.cursor++;
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: h.push, refresh: h.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import type { ReactElement, ReactNode } from "react";
import { ChatShell } from "@/components/chat/ChatShell";
import { toast } from "sonner";

const labels = {
  title: "AI",
  subtitle: "subtitle",
  newConversation: "new",
  inputPlaceholder: "input",
  send: "send",
  thinking: "thinking",
  errorRetry: "retry",
  errorGeneric: "generic error",
  errorQuota: "quota",
  errorAuth: "auth",
  expertHeading: "experts",
  expertSchedule: "book",
  contactCta: "contact",
  escalationContinue: "continue",
  escalationRecommend: "recommend",
  citationsHeading: "citations",
  backToDashboard: "back",
  languageLabel: "language",
  youLabel: "you",
  assistantLabel: "assistant",
  systemLabel: "system",
  operatorLabel: "operator",
  operatorBanner: "operator mode",
  pollError: "poll error",
};

type NodeProps = {
  children?: ReactNode;
  onClick?: () => Promise<void> | void;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  disabled?: boolean;
  content?: string;
};

function nodes(node: ReactNode): Array<ReactElement<NodeProps>> {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<NodeProps>;
  return [el, ...nodes(el.props.children)];
}

const CONVERSATION_A = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_B = "33333333-3333-4333-8333-333333333333";

function render() {
  h.cursor = 0;
  return nodes(ChatShell({ locale: "ja", labels }));
}
const input = () => render().find((n) => n.props.placeholder === "input")!.props;
const button = (text: string) =>
  render().find((n) => n.props.children === text && n.props.onClick)!.props;
const fill = (text: string) => input().onChange!({ target: { value: text } });
const shows = (content: string) => render().some((n) => n.props.content === content);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

function sseResponse(text: string, conversationId = CONVERSATION_A) {
  const events = [
    { type: "meta", conversationId, period: "2026-10" },
    { type: "token", text },
    { type: "done", kind: "answer", text, disclaimer: "disclaimer", citations: [], meta: {} },
  ];
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** A 200 response whose body fails partway through, like a dropped connection. */
function brokenStreamResponse() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: "token", text: "partial" })}\n\n`),
      );
      controller.error(new TypeError("Synthetic stream failure"));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ChatShell: a failed send must not lock the composer", () => {
  it("releases the composer when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Synthetic network failure")));
    render();
    fill("network error");

    let rejected: unknown;
    try {
      await button("send").onClick!();
    } catch (e) {
      rejected = e;
    }

    expect(rejected).toBeUndefined();
    expect(input().disabled).toBe(false);
    expect(shows("generic error")).toBe(true);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("generic error");
  });

  it("releases the composer when the stream breaks mid-read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(brokenStreamResponse()));
    render();
    fill("stream dies");

    await button("send").onClick!();

    expect(input().disabled).toBe(false);
    expect(shows("generic error")).toBe(true);
  });

  it("still sends after a failure, and a later success is unaffected", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Synthetic network failure"))
      .mockResolvedValue(sseResponse("recovered answer"));
    vi.stubGlobal("fetch", f);
    render();
    fill("first");
    await button("send").onClick!();
    fill("second");
    await button("send").onClick!();

    expect(f).toHaveBeenCalledTimes(2);
    expect(shows("recovered answer")).toBe(true);
    expect(input().disabled).toBe(false);
  });
});

describe("ChatShell: starting a new conversation discards the pending one", () => {
  it("drops a late reply and keeps the next question free of the old id", async () => {
    let resolve!: (r: Response) => void;
    const f = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", f);
    render();
    fill("old question");
    const pending = button("send").onClick!();

    button("new").onClick!();
    resolve(sseResponse("old delayed answer"));
    await pending;

    expect(shows("old delayed answer")).toBe(false);
    expect(h.replace).toHaveBeenCalledWith("/ja/chat");

    f.mockResolvedValue(sseResponse("new answer", CONVERSATION_B));
    fill("new question");
    await button("send").onClick!();

    expect(bodyOf(f.mock.calls[1]!).conversationId).toBeUndefined();
    expect(shows("new answer")).toBe(true);
    expect(input().disabled).toBe(false);
  });

  it("hands the reset to onReset when one is given, without navigating", async () => {
    const onReset = vi.fn();
    const f = vi.fn().mockResolvedValue(sseResponse("synthetic answer"));
    vi.stubGlobal("fetch", f);
    h.cursor = 0;
    const withReset = () => {
      h.cursor = 0;
      return nodes(ChatShell({ locale: "ja", labels, onReset }));
    };
    withReset().find((n) => n.props.placeholder === "input")!.props.onChange!({
      target: { value: "question" },
    });
    await withReset().find((n) => n.props.children === "send" && n.props.onClick)!.props.onClick!();
    withReset().find((n) => n.props.children === "new" && n.props.onClick)!.props.onClick!();

    expect(onReset).toHaveBeenCalledOnce();
    expect(h.replace).not.toHaveBeenCalled();
    expect(withReset().some((n) => n.props.content === "synthetic answer")).toBe(false);
  });

  it("aborts the request it abandons", async () => {
    const signals: AbortSignal[] = [];
    const f = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
      if (init.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", f);
    render();
    fill("abandon me");
    void button("send").onClick!();

    expect(signals[0]!.aborted).toBe(false);
    button("new").onClick!();
    expect(signals[0]!.aborted).toBe(true);
  });

  it("keeps the newer answer when the two replies land out of order", async () => {
    const resolvers: Array<(r: Response) => void> = [];
    const f = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolvers.push(r);
        }),
    );
    vi.stubGlobal("fetch", f);
    render();
    fill("old question");
    const first = button("send").onClick!();
    button("new").onClick!();
    fill("new question");
    const second = button("send").onClick!();

    // The second request finishes first, then the abandoned one answers.
    resolvers[1]!(sseResponse("new answer", CONVERSATION_B));
    await second;
    resolvers[0]!(sseResponse("old delayed answer", CONVERSATION_A));
    await first;

    expect(shows("new answer")).toBe(true);
    expect(shows("old delayed answer")).toBe(false);

    f.mockResolvedValue(sseResponse("third answer", CONVERSATION_B));
    fill("third question");
    await button("send").onClick!();
    expect(bodyOf(f.mock.calls[2]!).conversationId).toBe(CONVERSATION_B);
  });

  it("survives repeated resets while a request is pending", async () => {
    let resolve!: (r: Response) => void;
    const f = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", f);
    render();
    fill("old question");
    const pending = button("send").onClick!();

    button("new").onClick!();
    button("new").onClick!();
    button("new").onClick!();
    resolve(sseResponse("old delayed answer"));
    await pending;

    expect(shows("old delayed answer")).toBe(false);
    expect(input().disabled).toBe(false);

    f.mockResolvedValue(sseResponse("fresh answer", CONVERSATION_B));
    fill("fresh question");
    await button("send").onClick!();
    expect(bodyOf(f.mock.calls[1]!).conversationId).toBeUndefined();
    expect(shows("fresh answer")).toBe(true);
  });
});

describe("ChatShell: unchanged behaviour", () => {
  it("sends normally, reuses the conversation id and releases the composer", async () => {
    const f = vi.fn().mockResolvedValue(sseResponse("synthetic answer"));
    vi.stubGlobal("fetch", f);
    render();
    fill("first");
    await button("send").onClick!();

    expect(shows("synthetic answer")).toBe(true);
    expect(input().disabled).toBe(false);

    f.mockResolvedValue(sseResponse("second answer"));
    fill("second");
    await button("send").onClick!();
    expect(bodyOf(f.mock.calls[1]!).conversationId).toBe(CONVERSATION_A);
  });

  it("reports an HTTP 500 and allows a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR" } }), {
          status: 500,
        }),
      ),
    );
    render();
    fill("error");
    await button("send").onClick!();

    expect(input().disabled).toBe(false);
    expect(shows("generic error")).toBe(true);
  });

  it("refuses an empty or whitespace-only message", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render();
    expect(button("send").disabled).toBe(true);
    fill("   ");
    expect(button("send").disabled).toBe(true);
    await button("send").onClick!();
    expect(f).not.toHaveBeenCalled();
  });
});
