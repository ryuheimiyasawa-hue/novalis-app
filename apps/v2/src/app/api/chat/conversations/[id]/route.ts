import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/response";

// Per-conversation mutations for the sidebar's rename / delete actions.
// Both verify ownership via the admin client (eq user_id) before any
// write — RLS would also scope to auth.uid(), but we run service-role
// here so the explicit clause is the real gate. messages are removed
// by the conversations(id) ON DELETE CASCADE FK, so DELETE needs no
// separate message cleanup.

const UuidSchema = z.string().uuid();
const PatchBody = z.object({
  title: z.string().trim().min(1).max(100),
});

async function authAndOwn(
  id: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: ReturnType<typeof fail> }
> {
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, response: fail(e.code) };
    throw e;
  }
  if (!UuidSchema.safeParse(id).success) {
    return { ok: false, response: fail("INVALID_INPUT", "id") };
  }
  const admin = getAdminClient();
  const { data: conv, error } = await admin
    .from("conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[chat/conversations] ownership lookup:", error.message);
    return { ok: false, response: fail("INTERNAL_ERROR") };
  }
  if (!conv) return { ok: false, response: fail("NOT_FOUND") };
  if (conv.user_id !== userId) return { ok: false, response: fail("FORBIDDEN") };
  return { ok: true, userId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await authAndOwn(id);
  if (!gate.ok) return gate.response;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const admin = getAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ title: body.title })
    .eq("id", id);
  if (error) {
    console.error("[chat/conversations PATCH] update:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ id, title: body.title });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await authAndOwn(id);
  if (!gate.ok) return gate.response;

  const admin = getAdminClient();
  const { error } = await admin.from("conversations").delete().eq("id", id);
  if (error) {
    console.error("[chat/conversations DELETE] delete:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ id, deleted: true });
}
