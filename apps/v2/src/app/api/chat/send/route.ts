import { type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { fail } from "@/lib/api/response";
import { processChatStream, type StreamEvent } from "@/lib/ai/chat-pipeline";
import { checkChatQuota } from "@/lib/chat/trial-quota";
import {
  ConversationForbiddenError,
  ConversationNotFoundError,
  persistResult,
  resolveConversation,
  updateConversationTitle,
} from "@/lib/chat/persistence";
import { generateConversationTitle } from "@/lib/chat/title";

// /api/chat/send — W5 production SSE endpoint.
//
// Pre-stream guards:
//   - requireAuth() → 401
//   - Zod body validation → 400
//   - checkChatQuota() → 402 QUOTA_EXCEEDED (non-SSE JSON)
//   - resolveConversation() → 404 / 403 (non-SSE JSON) on bad
//     desiredConversationId
//
// Once these pass we open the SSE stream and emit:
//   data: {"type":"meta","conversationId":"...","period":"YYYY-MM"}
//   data: {"type":"token","text":"..."}              (answer only)
//   ...
//   data: {"type":"done","kind":"answer","text":"...","disclaimer":"...","citations":[...],"replyMessageId":"...","userMessageId":"...","meta":{...}}
//
// For escalate / blocked the stream still opens (so the client gets
// the same shape) but no tokens are emitted; the final `done` event
// carries the system message text and reason.

const BodySchema = z.object({
  message: z.string().min(1).max(2500),
  locale: z.enum(["ja", "en", "tl"]).default("ja"),
  conversationId: z.string().uuid().optional(),
});

const encoder = new TextEncoder();
function sse(payload: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: NextRequest) {
  // 1. Auth
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  // 2. Body
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  // 3. Quota / Trial
  const quota = await checkChatQuota(userId);
  if (!quota.decision.allowed) {
    return fail("RATE_LIMITED", quota.decision.reason);
  }

  // 4. Conversation
  let conversationId: string;
  let conversationCreated: boolean;
  try {
    const conv = await resolveConversation(userId, body.conversationId ?? null);
    conversationId = conv.id;
    conversationCreated = conv.created;
  } catch (e) {
    if (e instanceof ConversationNotFoundError) return fail("NOT_FOUND");
    if (e instanceof ConversationForbiddenError) return fail("FORBIDDEN");
    throw e;
  }

  // 5. Open the SSE stream.
  const message = body.message;
  const locale = body.locale;
  const period = quota.period;
  const countAgainstQuota = quota.decision.reason === "free_quota";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(sse(event));

      send({ type: "meta", conversationId, period });

      try {
        const result = await processChatStream(
          { message, locale, conversationId },
          (e: StreamEvent) => send(e),
        );

        // Persist the result + bump chat_usage when applicable. The
        // persistence layer chooses what to write per kind.
        let messageIds: { userMessageId?: string; replyMessageId?: string } = {};
        try {
          messageIds = await persistResult({
            result,
            conversationId,
            userId,
            userMessage: message,
            period,
            countAgainstQuota,
            whitelistDecision: result.decision,
          });
        } catch (persistErr) {
          // Persistence failure shouldn't blow up the response; the user
          // already got their answer in-stream. But it MUST NOT be silent:
          // Lesson 25 was an 8-day undetected persist outage that only
          // console.error'd. Report to Sentry + structured log so it alerts.
          // No message content is logged (PII) — only ids and the result kind.
          const errMessage =
            persistErr instanceof Error ? persistErr.message : String(persistErr);
          console.error(
            JSON.stringify({
              event: "chat_persist_failed",
              conversationId,
              userId,
              period,
              resultKind: result.kind,
              error: errMessage,
            }),
          );
          Sentry.captureException(persistErr, {
            tags: { area: "chat", op: "persist", resultKind: result.kind },
            extra: { conversationId, userId, period },
          });
        }

        // Emit the final event matching the discriminated result kind.
        if (result.kind === "answer") {
          send({
            type: "done",
            kind: "answer",
            text: result.text,
            disclaimer: result.disclaimer,
            citations: result.citations,
            meta: result.meta,
            ...messageIds,
          });
        } else if (result.kind === "escalate") {
          send({
            type: "done",
            kind: "escalate",
            reason: result.reason,
            text: result.text,
            ...messageIds,
          });
        } else if (result.kind === "smalltalk") {
          send({
            type: "done",
            kind: "smalltalk",
            text: result.text,
            ...messageIds,
          });
        } else {
          // blocked
          send({
            type: "done",
            kind: "blocked",
            reason: result.reason,
            text: result.text,
            piiTypes: result.piiTypes ?? [],
          });
        }

        // Auto-title a freshly created conversation from its first user
        // message. Runs AFTER the `done` event so it never delays the
        // user's reply; we still await it before close so the write
        // completes on serverless (post-response work isn't guaranteed
        // to run). The new title surfaces in the sidebar / metrics on
        // next load. Skipped for `blocked` (no user message was stored).
        if (conversationCreated && result.kind !== "blocked") {
          const title = await generateConversationTitle(message, locale);
          if (title) {
            await updateConversationTitle(conversationId, title);
          }
        }
      } catch (err) {
        console.error(
          `[chat/send] stream error: ${err instanceof Error ? err.message : String(err)}`,
        );
        send({
          type: "done",
          kind: "error",
          code: "INTERNAL_ERROR",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
