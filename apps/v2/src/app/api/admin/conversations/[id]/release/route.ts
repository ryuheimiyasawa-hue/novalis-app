import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireOperatorRole } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";
import { OperatorReleaseSchema } from "@/lib/admin/schemas";
import {
  canForceRelease,
  interpretRelease,
  type ReleaseOutcome,
} from "@/lib/admin/operator-guard";

// POST /api/admin/conversations/[id]/release — P2-B2.
//
// Hands the conversation back to the AI. `force: true` lets an admin
// recover a thread whose operator walked away; there is no auto-release
// cron (design §10-c), so this is the only way out of a forgotten
// takeover. Forced releases are logged with an explicit reason.

const UuidSchema = z.string().uuid();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let operatorUserId: string;
  let role: "admin" | "editor";
  try {
    const ctx = await requireOperatorRole();
    operatorUserId = ctx.user.id;
    role = ctx.role;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return fail("INVALID_INPUT", "id");

  let body: { force?: boolean; reason?: string };
  try {
    const raw = await req.text();
    body = OperatorReleaseSchema.parse(raw ? JSON.parse(raw) : {});
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const force = body.force === true;
  if (force && !canForceRelease(role)) {
    return fail("FORBIDDEN", "強制解除は管理者のみ実行できます");
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("operator_release", {
    p_conversation_id: id,
    p_operator_user_id: operatorUserId,
    p_force: force,
    p_reason: force ? (body.reason ?? "forced release by admin") : (body.reason ?? null),
  });
  if (error) {
    console.error("[admin/release] rpc error:", error.message);
    return fail("INTERNAL_ERROR");
  }

  const row = data?.[0];
  if (!row) {
    console.error("[admin/release] rpc returned no row");
    return fail("INTERNAL_ERROR");
  }

  const verdict = interpretRelease(row.outcome as ReleaseOutcome);
  if (!verdict.allowed) return fail(verdict.code, verdict.message);

  return ok({ mode: row.conv_mode });
}
