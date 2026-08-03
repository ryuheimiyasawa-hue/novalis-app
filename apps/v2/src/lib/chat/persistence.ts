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

/**
 * Marks a history turn as written by a human staff member rather than by
 * the model (P2-B2).
 *
 * Operator replies are, by their nature, advice about one person's
 * situation — the exact thing rule 1 of the system prompt forbids the
 * model from producing. Feeding them in as ordinary assistant turns
 * would show the model its own "past self" giving individualised advice
 * and invite it to continue in that register, quietly dissolving the
 * boundary the escalation design exists to hold.
 *
 * So the turn is labelled and the system prompt is told what the label
 * means: refer to it, never imitate it, never claim it as your own.
 * English on purpose — it is an instruction to the model, not user-
 * facing copy, and keeping it out of the conversation's language makes
 * it less likely to be echoed verbatim into a reply.
 *
 * The Stage-2 classifier receives the same history, so it now sees that
 * a human answered individually earlier in the thread. That nudges it
 * toward classifying follow-ups as individual — i.e. toward escalation,
 * which is the safe direction, and arguably the right one for a thread
 * that already needed a person.
 */
export const OPERATOR_TURN_PREFIX = "[Novalis support staff wrote]: ";

interface ConversationRow {
  id: string;
  user_id: string;
  mode?: "auto" | "operator";
}

/**
 * Resolve a conversation by id (validating ownership) or create a
 * new one for the user. Returns the conversation id, a flag for which
 * path was taken, and the current mode — the send route needs the mode
 * to know whether an operator has silenced the AI for this thread
 * (P2-B2). A freshly created conversation is always 'auto'.
 */
export async function resolveConversation(
  userId: string,
  desiredId: string | null,
  opts: NewConversationOpts = {},
): Promise<{ id: string; created: boolean; mode: "auto" | "operator" }> {
  const admin = getAdminClient();

  if (desiredId) {
    const { data, error } = await admin
      .from("conversations")
      .select("id, user_id, mode")
      .eq("id", desiredId)
      .maybeSingle<ConversationRow>();
    if (error) throw new Error(`resolveConversation read: ${error.message}`);
    if (!data) throw new ConversationNotFoundError(desiredId);
    if (data.user_id !== userId) throw new ConversationForbiddenError(desiredId);
    return { id: data.id, created: false, mode: data.mode ?? "auto" };
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
  return { id: data.id, created: true, mode: "auto" };
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
 * - the window is a character budget, not a turn count. A fixed 10 rows
 *   truncated conversations that were nowhere near any token limit —
 *   production's longest thread is 1,228 characters in total, roughly
 *   400 tokens against Gemini 2.5 Flash's 1M-token window — and P2-B2
 *   made it worse by letting operator turns compete for the same ten
 *   slots, so a few staff replies could push the user's original
 *   question out of view. See HISTORY_MAX_CHARS.
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
  opts: { maxChars?: number; maxRows?: number } = {},
): Promise<HistoryTurn[]> {
  if (!conversationId) return [];
  const maxChars = opts.maxChars ?? HISTORY_MAX_CHARS;
  const maxRows = opts.maxRows ?? HISTORY_MAX_ROWS;
  const admin = getAdminClient();
  // Pull the most-recent `limit` rows in DESC order to bound the
  // result set, then flip back to chronological for the model.
  //
  // `operator` rows are included as of P2-B2. Leaving them out meant
  // that once staff released a thread, the AI resumed with no idea what
  // the human had just told the user — so "what documents did you say
  // again?" got answered from nothing, contradicting live staff advice.
  // They are tagged rather than passed through as ordinary assistant
  // turns; see OPERATOR_TURN_PREFIX.
  //
  // `system` rows (escalation cards, PII blocks) stay out: they are UI
  // notices, not dialogue.
  const { data, error } = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant", "operator"])
    .order("created_at", { ascending: false })
    .limit(maxRows);
  if (error) {
    console.warn(
      `[chat] loadConversationHistory failed (degrading to single-turn): ${error.message}`,
    );
    return [];
  }
  if (!data || data.length === 0) return [];
  return toHistoryTurns(selectHistoryWindow(data, maxChars));
}

/**
 * Character budget for the history handed to the model.
 *
 * 12,000 characters is roughly 4,000 tokens for the mixed Japanese /
 * English / Tagalog text this app sees, and history goes to three calls
 * per user message (classifier, smalltalk, answer) — so about 12,000
 * input tokens per message at the ceiling, well under a yen at Flash
 * pricing. It is also an order of magnitude above production's longest
 * conversation, which means today every thread fits whole.
 *
 * A budget rather than a turn count because turns vary from "はい" to
 * 2,000 characters; counting rows charges the same for both and cuts
 * conversations that cost nothing to keep.
 *
 * When real conversations start reaching this ceiling — which is the
 * point where turns genuinely have to be dropped rather than merely
 * counted — summarising the older half becomes worth its cost. Not
 * before: that would add an LLM call, a failure path, and a stored
 * derivative of user speech for a case that does not yet occur.
 */
export const HISTORY_MAX_CHARS = 12_000;

/**
 * Hard ceiling on rows fetched, so one pathological thread cannot pull
 * an unbounded result set out of the database before the budget is even
 * applied. Not the primary limit — HISTORY_MAX_CHARS is.
 */
export const HISTORY_MAX_ROWS = 60;

/**
 * Take the most recent rows that fit the character budget.
 *
 * Input and output are both newest-first. The oldest surviving turn is
 * whichever one the budget stops at, so context is lost from the far end
 * of the conversation — the same direction as before, just much later.
 *
 * The newest row is always kept even when it alone exceeds the budget:
 * returning nothing would silently drop the user's immediate context and
 * is worse than one oversized turn (which MAX_INPUT_CHARS already caps
 * at 2,000 characters for user messages anyway).
 */
export function selectHistoryWindow<T extends { content: string }>(
  rowsNewestFirst: readonly T[],
  maxChars: number,
): T[] {
  const kept: T[] = [];
  let used = 0;
  for (const row of rowsNewestFirst) {
    const cost = row.content.length;
    if (kept.length > 0 && used + cost > maxChars) break;
    kept.push(row);
    used += cost;
  }
  return kept;
}

/**
 * Map persisted rows (newest-first, as the query returns them) to the
 * chronological turn list the model expects. Pure so the role mapping —
 * the part with the safety consequences — is testable without a
 * Supabase mock.
 */
export function toHistoryTurns(
  rowsNewestFirst: Array<{ role: string; content: string }>,
): HistoryTurn[] {
  return [...rowsNewestFirst].reverse().map<HistoryTurn>((row) => {
    if (row.role === "operator") {
      return { role: "model", text: `${OPERATOR_TURN_PREFIX}${row.content}` };
    }
    return {
      role: row.role === "assistant" ? "model" : "user",
      text: row.content,
    };
  });
}
