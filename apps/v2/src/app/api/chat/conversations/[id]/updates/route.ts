import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";

// GET /api/chat/conversations/[id]/updates?after=<ISO8601> — P2-B2.
//
// The delta feed the chat client polls so an operator's reply shows up
// without a reload. Sibling of ../messages, which returns the whole
// transcript; this one answers "anything new since X?" and is sized to
// be called every 5-30s (design §8).
//
// `mode` rides along on every response because it's how the client
// learns a takeover happened at all — that's what makes 30s polling in
// auto mode worth doing.

const UuidSchema = z.string().uuid();
// Accept only what we hand out: an ISO timestamp from a previous row.
const AfterSchema = z.string().datetime({ offset: true });

const MAX_ROWS = 50;

export async function GET(
  req: NextRequest,
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

  const afterRaw = req.nextUrl.searchParams.get("after");
  let after: string | null = null;
  if (afterRaw !== null) {
    const parsed = AfterSchema.safeParse(afterRaw);
    if (!parsed.success) return fail("INVALID_INPUT", "after");
    after = parsed.data;
  }

  const admin = getAdminClient();

  // Ownership first — this endpoint uses the service-role client, so the
  // check here is the only thing standing between two users' threads
  // (W3 Lesson 9: filter in code AND in RLS, never rely on one).
  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, mode")
    .eq("id", id)
    .maybeSingle();
  if (convErr) {
    console.error("[chat/updates] conv lookup:", convErr.message);
    return fail("INTERNAL_ERROR");
  }
  if (!conv) return fail("NOT_FOUND");
  if (conv.user_id !== userId) return fail("FORBIDDEN");

  // Without `after` the client only wants the current mode (first poll
  // after a page load, where the transcript came from the server render).
  if (after === null) {
    return ok({ mode: conv.mode, messages: [] });
  }

  const { data, error } = await admin
    .from("messages")
    .select("id, role, content, is_escalated, citations, created_at")
    .eq("conversation_id", id)
    .gt("created_at", after)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    console.error("[chat/updates] db error:", error.message);
    return fail("INTERNAL_ERROR");
  }

  return ok({ mode: conv.mode, messages: data });
}
