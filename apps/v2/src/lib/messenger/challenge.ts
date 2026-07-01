// Webhook verification handshake (GET). When you register the webhook,
// Facebook calls it with ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// and expects the challenge echoed back iff the verify_token matches the one
// we configured (MESSENGER_VERIFY_TOKEN). Pure.

export function resolveChallenge(opts: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyToken: string;
}): string | null {
  if (
    opts.mode === "subscribe" &&
    opts.token != null &&
    opts.token === opts.verifyToken &&
    opts.challenge != null
  ) {
    return opts.challenge;
  }
  return null;
}
