// Outbound send via the Facebook Graph API Send API. The actual network call
// only fires when a real MESSENGER_PAGE_ACCESS_TOKEN is configured; the request
// construction is a pure function so it unit-tests without hitting Facebook.

const GRAPH_VERSION = "v21.0";
// Messenger hard limit is 2000 chars per text message.
const MAX_TEXT = 2000;

export function buildSendRequest(
  psid: string,
  text: string,
  pageAccessToken: string,
): { url: string; body: string } {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
  const body = JSON.stringify({
    recipient: { id: psid },
    messaging_type: "RESPONSE",
    message: { text: text.slice(0, MAX_TEXT) },
  });
  return { url, body };
}

export async function sendMessengerText(
  psid: string,
  text: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const { url, body } = buildSendRequest(psid, text, pageAccessToken);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `graph ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
