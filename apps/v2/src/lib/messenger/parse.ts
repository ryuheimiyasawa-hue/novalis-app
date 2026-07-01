// Parse a Facebook Messenger webhook payload into the text messages we act on.
// Everything else (delivery/read receipts, echoes of our own sends, non-text
// attachments) is ignored. Pure + defensively typed against the untrusted
// webhook body.

export interface MessengerTextEvent {
  /** Page-scoped ID of the sender (stable per user per page). */
  psid: string;
  text: string;
  /** Message id — used as the idempotency key against redelivery. */
  mid: string;
}

interface RawMessaging {
  sender?: { id?: unknown };
  message?: { text?: unknown; mid?: unknown; is_echo?: unknown };
}

export function parseMessagingEvents(payload: unknown): MessengerTextEvent[] {
  const out: MessengerTextEvent[] = [];
  const body = payload as { object?: unknown; entry?: unknown };
  if (!body || body.object !== "page" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    const messaging = (entry as { messaging?: unknown })?.messaging;
    if (!Array.isArray(messaging)) continue;
    for (const raw of messaging as RawMessaging[]) {
      if (raw?.message?.is_echo) continue; // our own outbound, echoed back
      const psid = raw?.sender?.id;
      const text = raw?.message?.text;
      const mid = raw?.message?.mid;
      if (
        typeof psid === "string" &&
        psid.length > 0 &&
        typeof text === "string" &&
        text.length > 0 &&
        typeof mid === "string" &&
        mid.length > 0
      ) {
        out.push({ psid, text, mid });
      }
    }
  }
  return out;
}
