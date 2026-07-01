import { createHmac, timingSafeEqual } from "node:crypto";

// Messenger webhook request signing (P2-K). Facebook signs every POST body
// with the app secret and sends it as the X-Hub-Signature-256 header
// ("sha256=<hex>"). We MUST verify it against the RAW request body before
// trusting anything in the payload, otherwise anyone who learns the webhook
// URL could inject fake messages. Comparison is constant-time.

export function computeSignature(rawBody: string, appSecret: string): string {
  const hex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

export function verifyMessengerSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = computeSignature(rawBody, appSecret);
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so gate on length first. The
  // length itself is not secret (both are fixed-size sha256 hex strings).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
