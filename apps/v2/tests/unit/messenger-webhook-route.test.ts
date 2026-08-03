import { beforeEach, describe, expect, it, vi } from "vitest";

// Handler-level tests for the Messenger webhook.
//
// This route had none: tests/unit/messenger.test.ts covers the signature,
// parse, challenge and graph helpers, but nothing exercised the handler
// that wires them together. That is the part real users will hit first,
// and it is where the guards live — signature rejection, idempotency,
// the unlinked-sender branch, operator mode, and the PII gate.
//
// Everything that reaches outside the process is mocked; the signature
// module is deliberately NOT, so the tests sign their payloads the same
// way Facebook does and a regression in verification would fail here.

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));
vi.mock("@/lib/messenger/graph", () => ({ sendMessengerText: vi.fn() }));
vi.mock("@/lib/messenger/link-account", () => ({
  linkMessengerAccount: vi.fn(),
}));
vi.mock("@/lib/ai/chat-pipeline", () => ({
  processChat: vi.fn(),
  screenUserInput: vi.fn(() => null),
}));
vi.mock("@/lib/chat/trial-quota", () => ({ checkChatQuota: vi.fn() }));
vi.mock("@/lib/chat/persistence", () => ({
  resolveConversation: vi.fn(),
  persistResult: vi.fn(async () => ({})),
  persistUserMessage: vi.fn(async () => ({ id: "msg-1" })),
}));
vi.mock("@/lib/chat/escalation-notify", () => ({
  notifyEscalation: vi.fn(async () => undefined),
}));

import { GET, POST } from "@/app/api/messenger/webhook/route";
import { computeSignature } from "@/lib/messenger/signature";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendMessengerText } from "@/lib/messenger/graph";
import { linkMessengerAccount } from "@/lib/messenger/link-account";
import { processChat, screenUserInput } from "@/lib/ai/chat-pipeline";
import { checkChatQuota } from "@/lib/chat/trial-quota";
import {
  resolveConversation,
  persistResult,
  persistUserMessage,
} from "@/lib/chat/persistence";
import { notifyEscalation } from "@/lib/chat/escalation-notify";
import { buildDecision } from "@/lib/ai/whitelist-decision";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

const mockGetAdminClient = vi.mocked(getAdminClient);
const mockSend = vi.mocked(sendMessengerText);
const mockLinkAccount = vi.mocked(linkMessengerAccount);
const mockProcessChat = vi.mocked(processChat);
const mockScreenUserInput = vi.mocked(screenUserInput);
const mockCheckChatQuota = vi.mocked(checkChatQuota);
const mockResolveConversation = vi.mocked(resolveConversation);
const mockPersistResult = vi.mocked(persistResult);
const mockPersistUserMessage = vi.mocked(persistUserMessage);
const mockNotifyEscalation = vi.mocked(notifyEscalation);

/**
 * Minimal stand-in for the Supabase client, covering only the call
 * shapes this route uses: an insert on webhook_logs and select chains
 * ending in maybeSingle() on messenger_links / profiles / conversations.
 */
function fakeAdmin(rows: {
  claimError?: { code?: string; message?: string } | null;
  messenger_links?: { data: unknown; error?: unknown };
  profiles?: { data: unknown };
  conversations?: { data: unknown };
}) {
  return {
    from(table: string) {
      if (table === "webhook_logs") {
        return { insert: async () => ({ error: rows.claimError ?? null }) };
      }
      const result =
        table === "messenger_links"
          ? (rows.messenger_links ?? { data: null, error: null })
          : table === "profiles"
            ? (rows.profiles ?? { data: null })
            : (rows.conversations ?? { data: null });
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = async () => result;
      return chain;
    },
  } as unknown as ReturnType<typeof getAdminClient>;
}

function linkedAdmin(overrides: Parameters<typeof fakeAdmin>[0] = {}) {
  return fakeAdmin({
    messenger_links: { data: { user_id: "user-1" }, error: null },
    profiles: { data: { preferred_language: "ja" } },
    conversations: { data: { id: "conv-existing" } },
    ...overrides,
  });
}

function postReq(body: unknown, opts: { signature?: string } = {}) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/messenger/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": opts.signature ?? computeSignature(raw, APP_SECRET),
    },
    body: raw,
  }) as never;
}

function messageEvent(text: string, mid = "mid-1", psid = "psid-1") {
  return {
    object: "page",
    entry: [{ messaging: [{ sender: { id: psid }, message: { mid, text } }] }],
  };
}

function answerResult() {
  return {
    kind: "answer" as const,
    text: "一般的な情報です",
    disclaimer: "専門家にご相談ください",
    citations: [],
    decision: buildDecision({
      stage: "llm_general",
      outcome: "answer",
      category: "general",
      reason: "general",
    }),
    meta: {
      model: "gemini-2.5-flash",
      tokensIn: 10,
      tokensOut: 10,
      latencyMs: 1,
      finishReason: "STOP",
      piiMasked: false,
      ragEmbedMs: 0,
      ragMatchMs: 0,
      ragFailed: false,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.MESSENGER_APP_SECRET = APP_SECRET;
  process.env.MESSENGER_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.MESSENGER_PAGE_ACCESS_TOKEN = "page-token";
  process.env.NEXT_PUBLIC_APP_URL = "https://example.com";

  mockSend.mockResolvedValue({ ok: true });
  mockCheckChatQuota.mockResolvedValue({
    decision: { allowed: true, reason: "payment_disabled" },
    period: "2026-08",
  });
  mockResolveConversation.mockResolvedValue({
    id: "conv-1",
    created: false,
    mode: "auto",
  });
  mockScreenUserInput.mockReturnValue(null);
  mockPersistResult.mockResolvedValue({});
  mockPersistUserMessage.mockResolvedValue({ id: "msg-1" });
  mockGetAdminClient.mockReturnValue(linkedAdmin());
});

describe("GET — verification handshake", () => {
  it("echoes the challenge when the token matches", async () => {
    const req = new Request(
      `http://localhost/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
    );
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("refuses a wrong token", async () => {
    const req = new Request(
      "http://localhost/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    );
    expect((await GET(req as never)).status).toBe(403);
  });

  it("refuses when no verify token is configured", async () => {
    delete process.env.MESSENGER_VERIFY_TOKEN;
    const req = new Request(
      "http://localhost/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1",
    );
    expect((await GET(req as never)).status).toBe(403);
  });
});

describe("POST — request authentication", () => {
  it("rejects a forged signature without touching the pipeline", async () => {
    // The whole integration's trust boundary: anyone who learns the URL
    // could otherwise inject messages as any user.
    const res = await POST(postReq(messageEvent("hi"), { signature: "sha256=deadbeef" }));
    expect(res.status).toBe(401);
    expect(mockProcessChat).not.toHaveBeenCalled();
  });

  it("rejects a missing signature", async () => {
    const raw = JSON.stringify(messageEvent("hi"));
    const req = new Request("http://localhost/api/messenger/webhook", {
      method: "POST",
      body: raw,
    });
    expect((await POST(req as never)).status).toBe(401);
    expect(mockProcessChat).not.toHaveBeenCalled();
  });

  it("acknowledges and does nothing when the integration is unconfigured", async () => {
    // Facebook retries on non-2xx; a deployment without the secret should
    // not accumulate a retry backlog.
    delete process.env.MESSENGER_APP_SECRET;
    const res = await POST(postReq(messageEvent("hi")));
    expect(res.status).toBe(200);
    expect(mockProcessChat).not.toHaveBeenCalled();
  });

  it("returns 400 on a body that is not JSON", async () => {
    const raw = "not json";
    const req = new Request("http://localhost/api/messenger/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": computeSignature(raw, APP_SECRET) },
      body: raw,
    });
    expect((await POST(req as never)).status).toBe(400);
  });
});

describe("POST — delivery handling", () => {
  it("skips a redelivered message id without answering twice", async () => {
    mockGetAdminClient.mockReturnValue(
      linkedAdmin({ claimError: { code: "23505", message: "duplicate" } }),
    );
    const res = await POST(postReq(messageEvent("hi")));
    expect(res.status).toBe(200);
    expect(mockProcessChat).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("still returns 200 when an event throws, so Facebook stops retrying", async () => {
    mockGetAdminClient.mockReturnValue(
      linkedAdmin({ claimError: { code: "500", message: "db down" } }),
    );
    const res = await POST(postReq(messageEvent("hi")));
    expect(res.status).toBe(200);
  });

  it("ignores payloads with no usable message events", async () => {
    const res = await POST(postReq({ object: "page", entry: [] }));
    expect(res.status).toBe(200);
    expect(mockProcessChat).not.toHaveBeenCalled();
  });
});

describe("POST — unlinked sender", () => {
  beforeEach(() => {
    mockGetAdminClient.mockReturnValue(
      fakeAdmin({ messenger_links: { data: null, error: null } }),
    );
  });

  it("sends linking guidance instead of answering", async () => {
    await POST(postReq(messageEvent("ビザについて教えて")));
    expect(mockProcessChat).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][1]).toContain("/ja/messenger");
  });

  it("consumes a well-formed code as a link attempt", async () => {
    mockLinkAccount.mockResolvedValue({ status: "linked", userId: "user-1" });
    await POST(postReq(messageEvent("ABC234")));
    expect(mockLinkAccount).toHaveBeenCalled();
    expect(mockSend.mock.calls[0][1]).toContain("連携が完了");
  });

  it("treats a string containing excluded characters as ordinary text", async () => {
    // The code alphabet drops 0/1/I/O so a code read off a screen cannot
    // be mistyped ambiguously. The consequence, pinned here: something
    // like "123456" is not a code at all and falls through to guidance
    // rather than a "wrong code" reply.
    await POST(postReq(messageEvent("123456")));
    expect(mockLinkAccount).not.toHaveBeenCalled();
    expect(mockSend.mock.calls[0][1]).toContain("/ja/messenger");
  });

  it("tells the user when the code is expired or wrong", async () => {
    mockLinkAccount.mockResolvedValue({ status: "invalid_code" });
    await POST(postReq(messageEvent("999999")));
    expect(mockSend.mock.calls[0][1]).toContain("無効");
  });
});

describe("POST — linked sender, normal flow", () => {
  it("runs the pipeline, persists, and replies with the disclaimer attached", async () => {
    mockProcessChat.mockResolvedValue(answerResult());
    await POST(postReq(messageEvent("在留資格について教えて")));

    expect(mockProcessChat).toHaveBeenCalledOnce();
    expect(mockPersistResult).toHaveBeenCalledOnce();
    const sent = mockSend.mock.calls[0][1];
    expect(sent).toContain("一般的な情報です");
    expect(sent).toContain("専門家にご相談ください");
  });

  it("stops at the quota without calling the model", async () => {
    mockCheckChatQuota.mockResolvedValue({
      decision: { allowed: false, reason: "quota_exceeded", remaining: 0 },
      period: "2026-08",
    });
    await POST(postReq(messageEvent("hi")));
    expect(mockProcessChat).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("still replies when persistence fails", async () => {
    // Lesson 25: the write failing must not cost the user their answer —
    // it must alert instead, which reportPersistFailure does.
    mockProcessChat.mockResolvedValue(answerResult());
    mockPersistResult.mockRejectedValue(new Error("db down"));
    await POST(postReq(messageEvent("hi")));
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("alerts staff when the conversation escalates", async () => {
    mockProcessChat.mockResolvedValue({
      kind: "escalate",
      reason: "keyword",
      text: "専門家にご相談ください",
      detail: "kw:在留資格",
      decision: buildDecision({
        stage: "keyword",
        outcome: "escalate",
        reason: "kw:在留資格",
      }),
    });
    await POST(postReq(messageEvent("私のビザは更新できますか")));
    expect(mockNotifyEscalation).toHaveBeenCalledWith({
      conversationId: "conv-1",
      reason: "keyword",
      locale: "ja",
    });
  });

  it("does not alert on an ordinary answer", async () => {
    mockProcessChat.mockResolvedValue(answerResult());
    await POST(postReq(messageEvent("hi")));
    expect(mockNotifyEscalation).not.toHaveBeenCalled();
  });
});

describe("POST — operator mode", () => {
  beforeEach(() => {
    mockResolveConversation.mockResolvedValue({
      id: "conv-1",
      created: false,
      mode: "operator",
    });
  });

  it("keeps the AI silent and tells the user staff are handling it", async () => {
    await POST(postReq(messageEvent("まだ返事がありません")));
    expect(mockProcessChat).not.toHaveBeenCalled();
    expect(mockPersistUserMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      userId: "user-1",
      content: "まだ返事がありません",
    });
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("still refuses PII rather than storing it", async () => {
    // Lesson 30: bypassing the pipeline must not bypass the input gate.
    mockScreenUserInput.mockReturnValue({
      kind: "blocked",
      reason: "pii",
      text: "個人情報は送信できません",
      piiTypes: ["phone_jp"],
      decision: buildDecision({
        stage: "pii",
        outcome: "blocked",
        reason: "pii:phone_jp",
      }),
    });
    await POST(postReq(messageEvent("090-1234-5678")));
    expect(mockPersistUserMessage).not.toHaveBeenCalled();
    expect(mockSend.mock.calls[0][1]).toContain("個人情報");
  });
});
