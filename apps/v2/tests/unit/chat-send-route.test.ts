import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all of the route handler's dependencies so the test exercises
// the wiring (auth → quota → conversation → stream → persist) without
// touching real Gemini, real Supabase, or real Next runtime cookies.

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/chat/trial-quota", () => ({
  checkChatQuota: vi.fn(),
}));
vi.mock("@/lib/chat/persistence", async () => {
  // Re-export the error classes so `instanceof` checks in the route
  // handler stay accurate after mocking.
  const actual = await vi.importActual<
    typeof import("@/lib/chat/persistence")
  >("@/lib/chat/persistence");
  return {
    ...actual,
    resolveConversation: vi.fn(),
    persistResult: vi.fn(async () => ({})),
  };
});
vi.mock("@/lib/ai/chat-pipeline", () => ({
  processChatStream: vi.fn(),
}));

import { POST } from "@/app/api/chat/send/route";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { checkChatQuota } from "@/lib/chat/trial-quota";
import {
  ConversationForbiddenError,
  ConversationNotFoundError,
  resolveConversation,
} from "@/lib/chat/persistence";
import { processChatStream } from "@/lib/ai/chat-pipeline";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckChatQuota = vi.mocked(checkChatQuota);
const mockResolveConversation = vi.mocked(resolveConversation);
const mockProcessChatStream = vi.mocked(processChatStream);

beforeEach(() => {
  vi.resetAllMocks();
  // Defaults: auth ok, quota allowed, conversation resolved.
  mockRequireAuth.mockResolvedValue({ id: "user-1" } as never);
  mockCheckChatQuota.mockResolvedValue({
    decision: { allowed: true, reason: "payment_disabled" },
    period: "2026-05",
  });
  mockResolveConversation.mockResolvedValue({ id: "conv-1", created: true });
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/chat/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Read the streamed Response body and parse SSE frames into JSON
// payloads. Used by every test that expects a 200 response.
async function readSSE(res: Response): Promise<Array<Record<string, unknown>>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
  }
  const events: Array<Record<string, unknown>> = [];
  for (const frame of buffer.split("\n\n")) {
    const line = frame.trim();
    if (!line.startsWith("data:")) continue;
    events.push(JSON.parse(line.slice(5).trim()));
  }
  return events;
}

describe("POST /api/chat/send — pre-stream guards", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValueOnce(new AuthError("UNAUTHORIZED"));
    const res = await POST(makeReq({ message: "hi" }) as never);
    expect(res.status).toBe(401);
    expect(mockProcessChatStream).not.toHaveBeenCalled();
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeReq({ locale: "ja" }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_INPUT");
  });

  it("returns 400 on invalid locale", async () => {
    const res = await POST(
      makeReq({ message: "hi", locale: "zh" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid conversationId shape", async () => {
    const res = await POST(
      makeReq({ message: "hi", conversationId: "not-a-uuid" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns RATE_LIMITED when quota check refuses", async () => {
    mockCheckChatQuota.mockResolvedValueOnce({
      decision: { allowed: false, reason: "quota_exceeded", remaining: 0 },
      period: "2026-05",
    });
    const res = await POST(makeReq({ message: "hi" }) as never);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
    expect(mockProcessChatStream).not.toHaveBeenCalled();
  });

  it("returns 404 when the supplied conversationId is unknown", async () => {
    mockResolveConversation.mockRejectedValueOnce(
      new ConversationNotFoundError("11111111-1111-4111-9111-111111111111"),
    );
    const res = await POST(
      makeReq({
        message: "hi",
        conversationId: "11111111-1111-4111-9111-111111111111",
      }) as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the supplied conversationId belongs to someone else (IDOR)", async () => {
    mockResolveConversation.mockRejectedValueOnce(
      new ConversationForbiddenError("22222222-2222-4222-9222-222222222222"),
    );
    const res = await POST(
      makeReq({
        message: "hi",
        conversationId: "22222222-2222-4222-9222-222222222222",
      }) as never,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/chat/send — SSE happy path", () => {
  it("emits meta → token+ → done(answer) when the pipeline returns an answer", async () => {
    mockProcessChatStream.mockImplementationOnce(async (_input, onEvent) => {
      onEvent({ type: "token", text: "Working " });
      onEvent({ type: "token", text: "visas..." });
      return {
        kind: "answer",
        text: "Working visas...",
        disclaimer: "general info disclaimer",
        citations: [],
        meta: {
          model: "gemini-2.5-flash",
          tokensIn: 100,
          tokensOut: 30,
          latencyMs: 1500,
          finishReason: "STOP",
          piiMasked: false,
          ragEmbedMs: 400,
          ragMatchMs: 80,
          ragFailed: false,
        },
      };
    });
    const res = await POST(
      makeReq({ message: "How long is a working visa?", locale: "en" }) as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const events = await readSSE(res);
    expect(events[0]).toMatchObject({ type: "meta", conversationId: "conv-1", period: "2026-05" });
    expect(events.slice(1, 3)).toEqual([
      { type: "token", text: "Working " },
      { type: "token", text: "visas..." },
    ]);
    expect(events[3]).toMatchObject({
      type: "done",
      kind: "answer",
      text: "Working visas...",
      disclaimer: "general info disclaimer",
    });
  });

  it("emits meta → done(escalate) with no tokens for an escalate result", async () => {
    mockProcessChatStream.mockImplementationOnce(async () => ({
      kind: "escalate",
      reason: "keyword",
      text: "Please consult a professional.",
      detail: "kw:私の",
    }));
    const res = await POST(
      makeReq({ message: "私のビザは…" }) as never,
    );
    const events = await readSSE(res);
    expect(events[0].type).toBe("meta");
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      kind: "escalate",
      reason: "keyword",
      text: "Please consult a professional.",
    });
    // No token events between meta and done.
    expect(events.some((e) => e.type === "token")).toBe(false);
  });

  it("emits meta → done(blocked) for a blocked result (e.g. PII)", async () => {
    mockProcessChatStream.mockImplementationOnce(async () => ({
      kind: "blocked",
      reason: "pii",
      text: "PII not allowed",
      piiTypes: ["zairyu_card"],
    }));
    const res = await POST(makeReq({ message: "AB12345678CD" }) as never);
    const events = await readSSE(res);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      kind: "blocked",
      reason: "pii",
      piiTypes: ["zairyu_card"],
    });
  });

  it("emits done(error) when the pipeline throws unexpectedly", async () => {
    mockProcessChatStream.mockRejectedValueOnce(new Error("upstream crash"));
    const res = await POST(makeReq({ message: "hi" }) as never);
    const events = await readSSE(res);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      kind: "error",
      code: "INTERNAL_ERROR",
    });
  });
});
