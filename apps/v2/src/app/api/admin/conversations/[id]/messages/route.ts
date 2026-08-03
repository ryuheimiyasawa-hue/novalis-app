import { type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireOperatorRole } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { OperatorMessageSchema } from "@/lib/admin/schemas";
import {
  canSendOperatorMessage,
  type ConversationMode,
} from "@/lib/admin/operator-guard";

// POST /api/admin/conversations/[id]/messages — P2-B2.
//
// Writes a human reply into the thread as role='operator'. Deliberately
// NOT run through maskOutputPii: that filter exists to stop the model
// from echoing personal data back, and masking what a human staff
// member consciously typed would make the reply unreadable
// (design §7-10).
//
// The mode check and the INSERT are two statements, so a release landing
// between them lets one last operator line through. That is accepted:
// the user simply sees the operator's closing remark (design §5).

const UuidSchema = z.string().uuid();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let operatorUserId: string;
  try {
    const ctx = await requireOperatorRole();
    operatorUserId = ctx.user.id;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return fail("INVALID_INPUT", "id");

  let body: { content: string };
  try {
    body = OperatorMessageSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const admin = getAdminClient();

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, mode, operator_user_id")
    .eq("id", id)
    .maybeSingle();
  if (convErr) {
    console.error("[admin/operator-message] conv lookup:", convErr.message);
    return fail("INTERNAL_ERROR");
  }
  if (!conv) return fail("NOT_FOUND");

  const verdict = canSendOperatorMessage({
    mode: conv.mode as ConversationMode,
    operatorUserId: conv.operator_user_id,
    actorUserId: operatorUserId,
  });
  if (!verdict.allowed) return fail(verdict.code, verdict.message);

  const { data, error } = await admin
    .from("messages")
    .insert({
      conversation_id: id,
      role: "operator",
      sender_user_id: operatorUserId,
      content: body.content,
      is_escalated: false,
    })
    .select("id, created_at")
    .single();
  if (error) {
    // The operator watched their reply "fail to send" and the user is
    // still waiting. Never let this stay a console line.
    console.error(
      JSON.stringify({
        event: "operator_message_failed",
        conversationId: id,
        operatorUserId,
        error: error.message,
      }),
    );
    Sentry.captureException(new Error(`operator message insert: ${error.message}`), {
      tags: { area: "operator", op: "message" },
      extra: { conversationId: id, operatorUserId },
    });
    return fail("INTERNAL_ERROR");
  }

  return ok({ id: data.id, createdAt: data.created_at });
}
