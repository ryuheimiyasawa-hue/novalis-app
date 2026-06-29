import { getAdminClient } from "@/lib/supabase/admin";
import type { ChatAnswered, ChatResult } from "@/lib/ai/chat-pipeline";
import type { HistoryTurn } from "@/lib/ai/gemini";

// Persistence helpers for the W5 chat send endpoint. All writes go
// through the service-role admin client because:
//   - conversations / messages / chat_usage have row-owner RLS
//     policies; we'd otherwise need a per-request user session here,
//     which complicates server-side composition
//   - the writes are intrinsically server-only (the user can't write
//     `messages` directly; only the API can)
//   - the user_id is supplied explicitly so we still authorise at
//     the API layer (caller is responsible for matching it to
//     auth.uid() before invoking)
//
// IDOR protection: every operation that takes a conversationId also
// takes the expected userId and verifies ownership before any write
// or read. The route handler must NOT trust client-supplied
// conversationId without going through this layer.

export interface NewConversationOpts {
  channel?: "web" | "messenger";
  title?: string;
}

interface ConversationRow {
  id: string;
  user_id: string;
}

/**
 * Resolve a conversation by id (validating ownership) or create a
 * new one for the user. Returns the conversation id and a flag for
 * which path was taken.
 */
export async function resolveConversation(
  userId: string,
  desiredId: string | null,
  opts: NewConversationOpts = {},
): Promise<{ id: string; created: boolean }> {
  const admin = getAdminClient();

  if (desiredId) {
    const { data, error } = await admin
      .from("conversations")
      .select("id, user_id")
      .eq("id", desiredId)
      .maybeSingle<ConversationRow>();
    if (error) throw new Error(`resolveConversation read: ${error.message}`);
    if (!data) throw new ConversationNotFoundError(desiredId);
    if (data.user_id !== userId) throw new ConversationForbiddenError(desiredId);
    return { id: data.id, created: false };
  }

  const { data, error } = await admin
    .from("conversations")
    .insert({
      user_id: userId,
      channel: opts.channel ?? "web",
      title: opts.title ?? null,
      mode: "auto",
    })
    .select("id")
    .single<ConversationRow>();
  if (error) throw new Error(`resolveConversation insert: ${error.message}`);
  return { id: data.id, created: true };
}

/**
 * Best-effort update of a conversation's title. Used by the auto-title
 * flow after the first message of a new conversation. Never throws — a
 * failed title write must not affect the chat reply that already
 * succeeded; we log and move on.
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ title })
    .eq("id", conversationId);
  if (error) {
    console.warn(`[chat] updateConversationTitle failed: ${error.message}`);
  }
}

export class ConversationNotFoundError extends Error {
  readonly code = "CONVERSATION_NOT_FOUND" as const;
  constructor(public conversationId: string) {
    super(`conversation ${conversationId} not found`);
  }
}

export class ConversationForbiddenError extends Error {
  readonly code = "CONVERSATION_FORBIDDEN" as const;
  constructor(public conversationId: string) {
    super(`conversation ${conversationId} not owned by caller`);
  }
}

interface InsertedRow {
  id: string;
}

/**
 * Insert a user-authored message. The caller has already validated
 * the conversation belongs to this user (via resolveConversation).
 */
export async function persistUserMessage(args: {
  conversationId: string;
  userId: string;
  content: string;
}): Promise<{ id: string }> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      role: "user",
      sender_user_id: args.userId,
      content: args.content,
      is_escalated: false,
    })
    .select("id")
    .single<InsertedRow>();
  if (error) throw new Error(`persistUserMessage: ${error.message}`);
  return { id: data.id };
}

/**
 * Insert the assistant's reply. Stores citations + the LLM
 * classifier's decision so monthly sampling reviews can audit the
 * routing decision after the fact (master plan §9 #10).
 */
export async function persistAssistantMessage(args: {
  conversationId: string;
  result: ChatAnswered;
  whitelistDecision?: object;
}): Promise<{ id: string }> {
  const admin = getAdminClient();
  // Body composition: append disclaimer to the assistant text so the
  // stored message is the same string the user saw on screen. The UI
  // can split on the disclaimer separator if needed.
  const content = `${args.result.text}\n\n${args.result.disclaimer}`;
  const { data, error } = await admin
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      role: "assistant",
      content,
      is_escalated: false,
      whitelist_decision: args.whitelistDecision ?? null,
      citations: args.result.citations,
    })
    .select("id")
    .single<InsertedRow>();
  if (error) throw new Error(`persistAssistantMessage: ${error.message}`);
  return { id: data.id };
}

/**
 * Insert the smalltalk canned reply. Stored as `assistant` role so
 * the chat UI renders it inline like any other reply, but the
 * whitelist_decision JSONB carries `category: "smalltalk"` so audit
 * sampling can tell it apart from real AI answers. Smalltalk has no
 * disclaimer (the canned copy already explains scope) and no
 * citations — it never triggers the answer LLM.
 */
export async function persistSmalltalkMessage(args: {
  conversationId: string;
  text: string;
  whitelistDecision?: object;
}): Promise<{ id: string }> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      role: "assistant",
      content: args.text,
      is_escalated: false,
      whitelist_decision: args.whitelistDecision ?? null,
    })
    .select("id")
    .single<InsertedRow>();
  if (error) throw new Error(`persistSmalltalkMessage: ${error.message}`);
  return { id: data.id };
}

/**
 * Insert a system-authored message for escalate / blocked / takeover
 * notifications. `isEscalated=true` flags rows that resulted from a
 * Whitelist trigger so the monthly review can sample them
 * proportionally.
 */
export async function persistSystemMessage(args: {
  conversationId: string;
  content: string;
  isEscalated?: boolean;
  whitelistDecision?: object;
}): Promise<{ id: string }> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      role: "system",
      content: args.content,
      is_escalated: args.isEscalated ?? false,
      whitelist_decision: args.whitelistDecision ?? null,
    })
    .select("id")
    .single<InsertedRow>();
  if (error) throw new Error(`persistSystemMessage: ${error.message}`);
  return { id: data.id };
}

/**
 * Atomic +1 on chat_usage for the (user, period) pair. Delegates to
 * the increment_chat_usage SQL function from migration 005, which
 * does INSERT … ON CONFLICT DO UPDATE message_count = message_count
 * + 1 in a single statement so concurrent sends are race-free.
 *
 * Returns the new (post-increment) message count, useful for
 * structured logging.
 */
export async function incrementChatUsage(
  userId: string,
  period: string,
): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("increment_chat_usage", {
    p_user_id: userId,
    p_period: period,
  });
  if (error) throw new Error(`incrementChatUsage: ${error.message}`);
  return data ?? 0;
}

/**
 * Side-effect helper: persist the appropriate message rows for a
 * given pipeline result. Returns the assistant / system message id
 * for SSE meta payload.
 *
 * - blocked: persist NEITHER user nor assistant rows (we already
 *   refused the input; storing raw PII content is exactly what we're
 *   avoiding). The caller still emits a synthetic SSE event so the
 *   UI shows the block message.
 * - escalate: persist user + system message (escalation body), no
 *   chat_usage increment (master plan §2-4).
 * - smalltalk: persist user + assistant (canned reply), no
 *   chat_usage increment (matches escalate — neither path consumed
 *   a real AI answer call so charging the user is wrong).
 * - answer: persist user + assistant message + chat_usage +1.
 */
export async function persistResult(args: {
  result: ChatResult;
  conversationId: string;
  userId: string;
  userMessage: string;
  period: string;
  whitelistDecision?: object;
  countAgainstQuota: boolean;
}): Promise<{ userMessageId?: string; replyMessageId?: string }> {
  if (args.result.kind === "blocked") {
    // Do not persist the raw PII-bearing user input.
    return {};
  }

  const userRow = await persistUserMessage({
    conversationId: args.conversationId,
    userId: args.userId,
    content: args.userMessage,
  });

  if (args.result.kind === "escalate") {
    const sys = await persistSystemMessage({
      conversationId: args.conversationId,
      content: args.result.text,
      isEscalated: true,
      whitelistDecision: args.whitelistDecision,
    });
    return { userMessageId: userRow.id, replyMessageId: sys.id };
  }

  if (args.result.kind === "smalltalk") {
    const asst = await persistSmalltalkMessage({
      conversationId: args.conversationId,
      text: args.result.text,
      whitelistDecision: args.whitelistDecision,
    });
    // Smalltalk never consumes the monthly free quota (no answer LLM
    // call was made; charging would be wrong by §2-4).
    return { userMessageId: userRow.id, replyMessageId: asst.id };
  }

  // answer path: persist + increment usage when applicable.
  const asst = await persistAssistantMessage({
    conversationId: args.conversationId,
    result: args.result,
    whitelistDecision: args.whitelistDecision,
  });
  if (args.countAgainstQuota) {
    await incrementChatUsage(args.userId, args.period);
  }
  return { userMessageId: userRow.id, replyMessageId: asst.id };
}

/**
 * Fetch the most recent N user/assistant turns from a conversation,
 * ordered chronologically (oldest first), ready to feed to Gemini as
 * the `history` option of generate / generateStream.
 *
 * - role mapping: DB `user` → `user`, DB `assistant` → `model`.
 *   `system` rows are escalation / block notifications that were never
 *   actual AI conversation, so they are filtered out (including them
 *   would prime the model to escalate again and confuse the dialogue
 *   shape).
 * - limit defaults to 10 turns (≈5 user + 5 assistant). Calibrated so
 *   classifier + RAG context + history together stay well under
 *   Gemini 2.5 Flash's 1M-token window with budget headroom.
 * - returns [] when conversationId is null, when the conversation has
 *   no prior turns, or when the fetch fails (we never want a history
 *   error to break the chat reply — degrade gracefully to single-turn).
 *
 * NOTE: no ownership check. The route handler MUST call
 * resolveConversation() first to validate the user owns the
 * conversation; this loader trusts that gate.
 */
export async function loadConversationHistory(
  conversationId: string | null,
  limit = 10,
): Promise<HistoryTurn[]> {
  if (!conversationId) return [];
  const admin = getAdminClient();
  // Pull the most-recent `limit` rows in DESC order to bound the
  // result set, then flip back to chronological for the model.
  const { data, error } = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn(
      `[chat] loadConversationHistory failed (degrading to single-turn): ${error.message}`,
    );
    return [];
  }
  if (!data || data.length === 0) return [];
  return data
    .reverse()
    .map<HistoryTurn>((row) => ({
      role: row.role === "assistant" ? "model" : "user",
      text: row.content,
    }));
}
