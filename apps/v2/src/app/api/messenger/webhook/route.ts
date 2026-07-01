import { type NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { processChat, type ChatResult } from "@/lib/ai/chat-pipeline";
import { checkChatQuota } from "@/lib/chat/trial-quota";
import { resolveConversation, persistResult } from "@/lib/chat/persistence";
import { verifyMessengerSignature } from "@/lib/messenger/signature";
import { parseMessagingEvents } from "@/lib/messenger/parse";
import { resolveChallenge } from "@/lib/messenger/challenge";
import { sendMessengerText } from "@/lib/messenger/graph";
import type { WhitelistLocale } from "@/lib/ai/whitelist-keywords";

// Facebook Messenger webhook (P2-K).
//   GET  — one-time verification handshake (echo hub.challenge).
//   POST — inbound messages. Signature-verified against the RAW body, then
//          idempotently dispatched through the same chat pipeline as the web
//          app, and the reply is sent back via the Graph API.
//
// Internal parts (signature / idempotency / PSID resolution / pipeline
// dispatch) work now and are unit-tested; live send requires a real
// MESSENGER_PAGE_ACCESS_TOKEN + a public Facebook app (审查待ち). Public route
// (proxy.ts allowlists it) because Facebook calls it unauthenticated.

// Force Node runtime: signature verification needs node:crypto and we read the
// raw body via req.text().
export const runtime = "nodejs";

function env() {
  return {
    appSecret: process.env.MESSENGER_APP_SECRET,
    verifyToken: process.env.MESSENGER_VERIFY_TOKEN,
    pageToken: process.env.MESSENGER_PAGE_ACCESS_TOKEN,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  };
}

export async function GET(req: NextRequest) {
  const { verifyToken } = env();
  if (!verifyToken) return new NextResponse("not configured", { status: 403 });

  const url = new URL(req.url);
  const challenge = resolveChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    verifyToken,
  });
  if (challenge == null) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  const { appSecret, pageToken, appUrl } = env();

  // Read the raw body BEFORE parsing — signature is over the exact bytes.
  const rawBody = await req.text();

  // If Messenger isn't configured, acknowledge so Facebook stops retrying but
  // do nothing (the integration is effectively off).
  if (!appSecret) return NextResponse.json({ ok: true });

  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyMessengerSignature(rawBody, sig, appSecret)) {
    console.warn("[messenger] signature verification failed");
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const events = parseMessagingEvents(payload);
  // Always 200 to Facebook regardless of per-event outcome; retries are
  // deduped by the webhook_logs idempotency key.
  for (const ev of events) {
    try {
      await handleEvent(ev, { pageToken, appUrl });
    } catch (err) {
      console.error(
        `[messenger] event mid=${ev.mid} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return NextResponse.json({ ok: true });
}

function replyText(result: ChatResult): string {
  if (result.kind === "answer") return `${result.text}\n\n${result.disclaimer}`;
  return result.text; // escalate / smalltalk / blocked all carry .text
}

async function handleEvent(
  ev: { psid: string; text: string; mid: string },
  cfg: { pageToken?: string; appUrl: string },
): Promise<void> {
  const admin = getAdminClient();

  // 1. Idempotency: claim this message id. A duplicate delivery conflicts on
  //    UNIQUE(source, external_event_id) and is skipped.
  const claim = await admin
    .from("webhook_logs")
    .insert({
      source: "messenger",
      external_event_id: ev.mid,
      payload: { psid: ev.psid },
    });
  if (claim.error) {
    if (claim.error.code === "23505") return; // already processed
    throw new Error(`webhook_logs insert: ${claim.error.message}`);
  }

  const send = (text: string) =>
    cfg.pageToken
      ? sendMessengerText(ev.psid, text, cfg.pageToken)
      : Promise.resolve({ ok: false, error: "no page token" });

  // 2. Resolve the PSID to a Novalis user.
  const link = await admin
    .from("messenger_links")
    .select("user_id")
    .eq("messenger_psid", ev.psid)
    .maybeSingle<{ user_id: string }>();
  if (link.error) throw new Error(`messenger_links: ${link.error.message}`);
  if (!link.data) {
    // Unlinked sender: prompt them to connect their account on the web.
    await send(
      `アカウントの連携が必要です。こちらからログインしてください: ${cfg.appUrl}/login`,
    );
    return;
  }
  const userId = link.data.user_id;

  // 3. Locale from the user's profile (default ja).
  const prof = await admin
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle<{ preferred_language: string | null }>();
  const locale = ((prof.data?.preferred_language ?? "ja") as WhitelistLocale);

  // 4. Quota.
  const quota = await checkChatQuota(userId);
  if (!quota.decision.allowed) {
    await send(quota.decision.reason ?? "利用上限に達しました。");
    return;
  }
  const countAgainstQuota = quota.decision.reason === "free_quota";

  // 5. Reuse the user's latest Messenger conversation, or start one.
  const existing = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", "messenger")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  const conv = await resolveConversation(
    userId,
    existing.data?.id ?? null,
    { channel: "messenger" },
  );

  // 6. Run the pipeline + persist (same as the web path, minus streaming).
  const result = await processChat({
    message: ev.text,
    locale,
    conversationId: conv.id,
  });
  try {
    await persistResult({
      result,
      conversationId: conv.id,
      userId,
      userMessage: ev.text,
      period: quota.period,
      countAgainstQuota,
      whitelistDecision: result.decision,
    });
  } catch (err) {
    console.error(
      `[messenger] persist failed mid=${ev.mid}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 7. Reply.
  const out = await send(replyText(result));
  if (!out.ok) {
    console.warn(`[messenger] send failed mid=${ev.mid}: ${out.error}`);
  }
}
