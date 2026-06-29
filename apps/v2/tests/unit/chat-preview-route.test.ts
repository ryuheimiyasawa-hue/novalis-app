import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth + pipeline so the route's plumbing is exercised without
// hitting real auth or Gemini.
vi.mock("@/lib/auth/require-admin", () => ({
  requireEditor: vi.fn(),
}));
vi.mock("@/lib/ai/chat-pipeline", () => ({
  processChat: vi.fn(),
}));

import { POST } from "@/app/api/chat/preview/route";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { processChat } from "@/lib/ai/chat-pipeline";
import { buildDecision } from "@/lib/ai/whitelist-decision";

const mockRequireEditor = vi.mocked(requireEditor);
const mockProcessChat = vi.mocked(processChat);

beforeEach(() => {
  vi.resetAllMocks();
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/chat/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireEditor.mockRejectedValueOnce(new AuthError("UNAUTHORIZED"));
    const res = await POST(makeReq({ message: "hi", locale: "ja" }) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(mockProcessChat).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-editor", async () => {
    mockRequireEditor.mockRejectedValueOnce(new AuthError("FORBIDDEN"));
    const res = await POST(makeReq({ message: "hi", locale: "ja" }) as never);
    expect(res.status).toBe(403);
    expect(mockProcessChat).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input (missing message)", async () => {
    mockRequireEditor.mockResolvedValueOnce({
      user: { id: "test" },
      role: "editor",
    } as never);
    const res = await POST(makeReq({ locale: "ja" }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_INPUT");
    expect(mockProcessChat).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid locale", async () => {
    mockRequireEditor.mockResolvedValueOnce({
      user: { id: "test" },
      role: "editor",
    } as never);
    const res = await POST(
      makeReq({ message: "hi", locale: "zh" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("forwards a valid request to processChat and wraps the result in {ok,data}", async () => {
    mockRequireEditor.mockResolvedValueOnce({
      user: { id: "test" },
      role: "admin",
    } as never);
    mockProcessChat.mockResolvedValueOnce({
      kind: "answer",
      text: "general info",
      disclaimer: "...",
      decision: buildDecision({
        stage: "llm_general",
        outcome: "answer",
        category: "general",
        reason: "general rule",
      }),
      citations: [],
      meta: {
        model: "gemini-2.5-flash",
        tokensIn: 100,
        tokensOut: 50,
        latencyMs: 1500,
        finishReason: "STOP",
        piiMasked: false,
        ragEmbedMs: 0,
        ragMatchMs: 0,
        ragFailed: false,
      },
    });
    const res = await POST(
      makeReq({ message: "How long is a working visa?", locale: "en" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe("answer");
    expect(mockProcessChat).toHaveBeenCalledWith({
      message: "How long is a working visa?",
      locale: "en",
    });
  });

  it("returns the blocked discriminant when the pipeline blocks PII", async () => {
    mockRequireEditor.mockResolvedValueOnce({
      user: { id: "test" },
      role: "editor",
    } as never);
    mockProcessChat.mockResolvedValueOnce({
      kind: "blocked",
      reason: "pii",
      text: "block message",
      piiTypes: ["zairyu_card"],
      decision: buildDecision({
        stage: "pii",
        outcome: "blocked",
        reason: "pii:zairyu_card",
      }),
    });
    const res = await POST(
      makeReq({ message: "AB12345678CD", locale: "ja" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kind).toBe("blocked");
    expect(body.data.piiTypes).toContain("zairyu_card");
  });
});
