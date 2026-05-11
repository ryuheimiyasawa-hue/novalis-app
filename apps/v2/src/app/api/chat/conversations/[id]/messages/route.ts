import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";

const UuidSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return fail("INVALID_INPUT", "id");

  const admin = getAdminClient();

  // Ownership check before reading the messages.
  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (convErr) {
    console.error("[chat/messages GET] conv lookup:", convErr.message);
    return fail("INTERNAL_ERROR");
  }
  if (!conv) return fail("NOT_FOUND");
  if (conv.user_id !== userId) return fail("FORBIDDEN");

  const { data, error } = await admin
    .from("messages")
    .select("id, role, sender_user_id, content, is_escalated, citations, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[chat/messages GET] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok(data);
}
