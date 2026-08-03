import { type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireOperatorRole } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { OperatorTakeoverSchema } from "@/lib/admin/schemas";
import {
  canTakeOverChannel,
  interpretTakeover,
  type TakeoverOutcome,
} from "@/lib/admin/operator-guard";

// POST /api/admin/conversations/[id]/takeover — P2-B2.
//
// Flips the conversation to operator mode so /api/chat/send stops
// calling Gemini for it, and records who did so. The state change and
// the audit row happen inside the operator_takeover RPC (migration 010)
// precisely so they cannot drift apart; see design §5.

const UuidSchema = z.string().uuid();

/**
 * A failed takeover is not a cosmetic error: staff pressed the button
 * because they wanted to stop the AI from answering this user, and a
 * silent 500 means it keeps answering. Alert, don't just console.error
 * (Lesson 25 — the failure has to reach someone).
 */
function reportFailure(
  op: string,
  message: string,
  conversationId: string,
  operatorUserId: string,
) {
  console.error(
    JSON.stringify({
      event: "operator_takeover_failed",
      op,
      conversationId,
      operatorUserId,
      error: message,
    }),
  );
  Sentry.captureException(new Error(`operator takeover ${op}: ${message}`), {
    tags: { area: "operator", op },
    extra: { conversationId, operatorUserId },
  });
}

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

  // An empty body is fine — `reason` is optional.
  let body: { reason?: string };
  try {
    const raw = await req.text();
    body = OperatorTakeoverSchema.parse(raw ? JSON.parse(raw) : {});
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const admin = getAdminClient();

  // Channel check needs the row anyway; the RPC still re-checks
  // existence, so a conversation deleted between these two calls just
  // comes back as `not_found`.
  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, channel")
    .eq("id", id)
    .maybeSingle();
  if (convErr) {
    reportFailure("conv_lookup", convErr.message, id, operatorUserId);
    return fail("INTERNAL_ERROR");
  }
  if (!conv) return fail("NOT_FOUND");

  const channelGuard = canTakeOverChannel(conv.channel);
  if (!channelGuard.allowed) {
    return fail(channelGuard.code, channelGuard.message);
  }

  const { data, error } = await admin.rpc("operator_takeover", {
    p_conversation_id: id,
    p_operator_user_id: operatorUserId,
    p_reason: body.reason ?? null,
  });
  if (error) {
    reportFailure("rpc", error.message, id, operatorUserId);
    return fail("INTERNAL_ERROR");
  }

  const row = data?.[0];
  if (!row) {
    reportFailure("rpc_empty", "returned no row", id, operatorUserId);
    return fail("INTERNAL_ERROR");
  }

  const verdict = interpretTakeover(row.outcome as TakeoverOutcome);
  if (!verdict.allowed) return fail(verdict.code, verdict.message);

  return ok({
    mode: row.conv_mode,
    operatorUserId: row.conv_operator_user_id,
    operatorStartedAt: row.conv_operator_started_at,
  });
}
