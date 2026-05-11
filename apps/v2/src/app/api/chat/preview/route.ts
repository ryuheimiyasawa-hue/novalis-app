import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { ok, fail } from "@/lib/api/response";
import { processChat } from "@/lib/ai/chat-pipeline";

// W4 smoke endpoint. NOT the production chat path — that comes in W5
// as /api/chat/send with SSE, persistence, quota, and Welcome Trial
// gating. This endpoint is editor+ only and exists so admins can
// manually verify the W4 pipeline before W5 wires it to a real UI.
//
// The body just runs through `processChat` and returns the typed
// result as JSON. No conversations / messages are persisted.

const PreviewSchema = z.object({
  message: z.string().min(1).max(2500), // pipeline enforces 2000; we accept a tad more so "too_long" can be observed
  locale: z.enum(["ja", "en", "tl"]).default("ja"),
});

export async function POST(req: NextRequest) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.code);
    throw e;
  }

  let body: z.infer<typeof PreviewSchema>;
  try {
    body = PreviewSchema.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return fail("INVALID_INPUT", message);
  }

  const result = await processChat({
    message: body.message,
    locale: body.locale,
  });

  return ok(result);
}
