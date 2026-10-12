// The production POST handler, NextRequest, auth helper, current-consent
// check and SSE client run together. Only Supabase/AI/persistence/notification
// boundaries are synthetic. No listening socket, browser or real API calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { id: "synthetic-user" } as { id: string } | null,
  consentRows: [] as { terms_version: string; privacy_version: string }[],
  consentError: null as null | { message: string },
  from: vi.fn(), getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ from: h.from }) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/chat/trial-quota", () => ({ checkChatQuota: vi.fn() }));
vi.mock("@/lib/chat/persistence", async () => ({
  ...await vi.importActual<typeof import("@/lib/chat/persistence")>("@/lib/chat/persistence"),
  resolveConversation: vi.fn(), persistResult: vi.fn(), persistUserMessage: vi.fn(), updateConversationTitle: vi.fn(),
}));
vi.mock("@/lib/ai/chat-pipeline", () => ({ processChatStream: vi.fn(), screenUserInput: vi.fn() }));
vi.mock("@/lib/chat/title", () => ({ generateConversationTitle: vi.fn() }));
vi.mock("@/lib/chat/escalation-notify", () => ({ notifyEscalation: vi.fn() }));

import { POST } from "@/app/api/chat/send/route";
import { consumeChatStream, type ChatStreamEvent } from "@/lib/chat/sse-client";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";
import { checkChatQuota } from "@/lib/chat/trial-quota";
import { processChatStream, screenUserInput } from "@/lib/ai/chat-pipeline";
import { persistResult, persistUserMessage, resolveConversation } from "@/lib/chat/persistence";
import { generateConversationTitle } from "@/lib/chat/title";
import { buildDecision } from "@/lib/ai/whitelist-decision";

const CID = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.resetAllMocks();
  h.user = { id: "synthetic-user" };
  h.consentRows = [{ terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION }];
  h.consentError = null;
  h.getUser.mockImplementation(async () => ({ data: { user: h.user }, error: null }));
  h.from.mockImplementation((table: string) => {
    if (table !== "consent_logs") throw new Error("Unexpected synthetic table");
    const query = { select: () => query, eq: () => query, order: () => query,
      limit: async () => ({ data: h.consentRows, error: h.consentError }) };
    return query;
  });
  vi.mocked(checkChatQuota).mockResolvedValue({ decision: { allowed: true, reason: "payment_disabled" }, period: "2026-10" });
  vi.mocked(resolveConversation).mockResolvedValue({ id: CID, created: false, mode: "auto" });
  vi.mocked(persistResult).mockResolvedValue({ userMessageId: "synthetic-question", replyMessageId: "synthetic-answer" });
  vi.mocked(persistUserMessage).mockResolvedValue({ id: "synthetic-question" });
  vi.mocked(generateConversationTitle).mockResolvedValue(null);
  vi.mocked(screenUserInput).mockReturnValue(null);
  vi.mocked(processChatStream).mockImplementation(async (_input, emit) => {
    emit({ type: "token", text: "合成" }); emit({ type: "token", text: "回答" });
    return { kind: "answer", text: "合成回答", disclaimer: "合成免責文",
      citations: [{ source_type: "faq", source_id: "synthetic-faq", title: "合成引用", snippet: "synthetic snippet", language: "ja", similarity: 0.95, slug: null }],
      decision: buildDecision({ stage: "llm_general", outcome: "answer", category: "general", reason: "synthetic general" }),
      meta: { model: "synthetic-model", tokensIn: 1, tokensOut: 1, latencyMs: 1,
        finishReason: "STOP", piiMasked: false, ragEmbedMs: 0, ragMatchMs: 0, ragFailed: false },
    };
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url !== "/api/chat/send" || init.method !== "POST") throw new Error("Unexpected local transport");
    return POST(new NextRequest("http://localhost/api/chat/send", { ...init, signal: init.signal ?? undefined }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function send(locale: "ja" | "en" | "tl" = "ja", message = "synthetic question") {
  const events: ChatStreamEvent[] = [];
  const onHttpError = vi.fn();
  await consumeChatStream({ message, locale }, { onEvent: event => events.push(event), onHttpError });
  return { events, onHttpError };
}

describe("Production HTTP handler ↔ SSE client, with synthetic service boundaries", () => {
  it.each(["ja", "en", "tl"] as const)("preserves streamed text, citation, disclaimer and ids in %s", async locale => {
    const { events, onHttpError } = await send(locale);
    expect(onHttpError).not.toHaveBeenCalled();
    expect(events[0]).toEqual({ type: "meta", conversationId: CID, period: "2026-10" });
    expect(events.filter(e => e.type === "token")).toEqual([{ type: "token", text: "合成" }, { type: "token", text: "回答" }]);
    expect(events.at(-1)).toMatchObject({ type: "done", kind: "answer", text: "合成回答",
      disclaimer: "合成免責文", citations: [expect.objectContaining({ title: "合成引用" })],
      userMessageId: "synthetic-question", replyMessageId: "synthetic-answer" });
    expect(h.getUser).toHaveBeenCalledOnce();
    expect(h.from).toHaveBeenCalledWith("consent_logs");
    expect(processChatStream).toHaveBeenCalledWith(expect.objectContaining({ locale }), expect.any(Function));
  });
  it("refuses stale consent before AI/storage, then allows a retry after current consent", async () => {
    h.consentRows[0]!.terms_version = "stale-version";
    const stale = await send();
    expect(stale.events).toEqual([]);
    expect(stale.onHttpError).toHaveBeenCalledWith(403, expect.objectContaining({ error: expect.objectContaining({ code: "CONSENT_REQUIRED" }) }));
    expect(checkChatQuota).not.toHaveBeenCalled(); expect(processChatStream).not.toHaveBeenCalled(); expect(persistResult).not.toHaveBeenCalled();
    h.consentRows[0]!.terms_version = CURRENT_TERMS_VERSION;
    const retry = await send(); expect(retry.events.at(-1)).toMatchObject({ type: "done", kind: "answer" });
  });
  it("reports unauthenticated status to the SSE client without querying consent", async () => {
    h.user = null;
    const { events, onHttpError } = await send();
    expect(events).toEqual([]); expect(onHttpError).toHaveBeenCalledWith(401, expect.anything());
    expect(h.from).not.toHaveBeenCalled(); expect(processChatStream).not.toHaveBeenCalled();
  });
  it("fails closed if the consent database adapter fails", async () => {
    h.consentError = { message: "synthetic consent read failure" };
    const { events, onHttpError } = await send();
    expect(events).toEqual([]); expect(onHttpError).toHaveBeenCalledWith(500, expect.anything());
    expect(processChatStream).not.toHaveBeenCalled(); expect(persistResult).not.toHaveBeenCalled();
  });
  it("delivers quota rejection as HTTP 429 before conversation or AI work", async () => {
    vi.mocked(checkChatQuota).mockResolvedValue({ decision: { allowed: false, reason: "quota_exceeded" }, period: "2026-10" });
    const { events, onHttpError } = await send();
    expect(events).toEqual([]); expect(onHttpError).toHaveBeenCalledWith(429, expect.anything());
    expect(resolveConversation).not.toHaveBeenCalled(); expect(processChatStream).not.toHaveBeenCalled();
  });
  it("delivers empty-input rejection as HTTP 400 without SSE events", async () => {
    const { events, onHttpError } = await send("ja", "");
    expect(events).toEqual([]); expect(onHttpError).toHaveBeenCalledWith(400, expect.anything());
    expect(checkChatQuota).not.toHaveBeenCalled(); expect(processChatStream).not.toHaveBeenCalled();
  });
  it("operator mode returns the pending terminal event without calling AI", async () => {
    vi.mocked(resolveConversation).mockResolvedValue({ id: CID, created: false, mode: "operator" });
    const { events, onHttpError } = await send();
    expect(onHttpError).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "done", kind: "operator_pending", userMessageId: "synthetic-question" });
    expect(processChatStream).not.toHaveBeenCalled(); expect(persistResult).not.toHaveBeenCalled(); expect(persistUserMessage).toHaveBeenCalledOnce();
  });
});
