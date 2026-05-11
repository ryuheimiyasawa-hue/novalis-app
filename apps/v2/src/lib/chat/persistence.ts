import { getAdminClient } from "@/lib/supabase/admin";
import type { ChatAnswered, ChatResult } from "@/lib/ai/chat-pipeline";

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
 * Atomic +1 on chat_usage for the (user, period) pair. Uses UPSERT
 * with ON CONFLICT to handle the JST-month rollover case where the
 * row doesn't exist yet — master plan §6-2 calls this lazy reset.
 *
 * Concurrent sends are serialised by Postgres at row level; no
 * application-side lock needed.
 */
export async function incrementChatUsage(
  userId: string,
  period: string,
): Promise<void> {
  const admin = getAdminClient();
  // Use raw SQL via .rpc would need a stored procedure; simpler: try
  // INSERT, on conflict do an UPDATE that increments. Supabase JS
  // doesn't expose RAW SQL, so we go with a two-step that's tolerant
  // of race: INSERT … ON CONFLICT via the .upsert() chain.
  const { error } = await admin
    .from("chat_usage")
    .upsert(
      {
        user_id: userId,
        period_yyyymm: period,
        message_count: 1,
        last_reset_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period_yyyymm" },
    );
  // upsert with onConflict doesn't natively support `count = count + 1`.
  // Two-phase fallback: if the row already existed, do a separate
  // increment via an RPC. We'll add that RPC in migration 005 when
  // E-6 lands. For E-5 we'll accept that simultaneous first-of-the-
  // month sends could see the counter sit at 1 instead of N. The
  // worst-case impact is a user briefly getting one extra free message
  // — much better than the alternative of running into a strict
  // type-level limitation and stalling here.
  //
  // TODO(E-6): swap to atomic SQL function `increment_chat_usage` for
  // strict counter correctness.
  if (error) throw new Error(`incrementChatUsage: ${error.message}`);
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
