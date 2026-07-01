import { describe, expect, it } from "vitest";
import {
  computeSignature,
  verifyMessengerSignature,
} from "@/lib/messenger/signature";
import { parseMessagingEvents } from "@/lib/messenger/parse";
import { resolveChallenge } from "@/lib/messenger/challenge";
import { buildSendRequest } from "@/lib/messenger/graph";

const SECRET = "test-app-secret";

describe("messenger signature", () => {
  it("verifies a correctly-signed body", () => {
    const body = '{"object":"page"}';
    const sig = computeSignature(body, SECRET);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifyMessengerSignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = computeSignature('{"object":"page"}', SECRET);
    expect(verifyMessengerSignature('{"object":"evil"}', sig, SECRET)).toBe(
      false,
    );
  });

  it("rejects a wrong secret", () => {
    const body = '{"a":1}';
    const sig = computeSignature(body, SECRET);
    expect(verifyMessengerSignature(body, sig, "other-secret")).toBe(false);
  });

  it("rejects a missing / malformed header", () => {
    const body = '{"a":1}';
    expect(verifyMessengerSignature(body, null, SECRET)).toBe(false);
    expect(verifyMessengerSignature(body, "sha256=deadbeef", SECRET)).toBe(
      false,
    );
  });
});

describe("messenger parse", () => {
  function payload(messaging: unknown[]) {
    return { object: "page", entry: [{ messaging }] };
  }

  it("extracts a text message", () => {
    const out = parseMessagingEvents(
      payload([
        { sender: { id: "PSID1" }, message: { text: "hello", mid: "m1" } },
      ]),
    );
    expect(out).toEqual([{ psid: "PSID1", text: "hello", mid: "m1" }]);
  });

  it("skips echoes of our own sends", () => {
    const out = parseMessagingEvents(
      payload([
        {
          sender: { id: "PAGE" },
          message: { text: "hi", mid: "m2", is_echo: true },
        },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("skips non-text events (attachments, receipts)", () => {
    const out = parseMessagingEvents(
      payload([
        { sender: { id: "P" }, message: { mid: "m3", attachments: [{}] } },
        { sender: { id: "P" }, delivery: { mids: ["m1"] } },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("ignores payloads that are not page webhooks", () => {
    expect(parseMessagingEvents({ object: "instagram" })).toEqual([]);
    expect(parseMessagingEvents(null)).toEqual([]);
    expect(parseMessagingEvents({})).toEqual([]);
  });
});

describe("messenger challenge", () => {
  it("echoes the challenge on a matching verify token", () => {
    expect(
      resolveChallenge({
        mode: "subscribe",
        token: "vt",
        challenge: "1234",
        verifyToken: "vt",
      }),
    ).toBe("1234");
  });

  it("rejects a mismatched token or wrong mode", () => {
    expect(
      resolveChallenge({
        mode: "subscribe",
        token: "wrong",
        challenge: "1234",
        verifyToken: "vt",
      }),
    ).toBeNull();
    expect(
      resolveChallenge({
        mode: "unsubscribe",
        token: "vt",
        challenge: "1234",
        verifyToken: "vt",
      }),
    ).toBeNull();
  });
});

describe("messenger graph send request", () => {
  it("builds a Send API request with the token and recipient", () => {
    const { url, body } = buildSendRequest("PSID9", "hi", "TOKEN 1");
    expect(url).toContain("/me/messages");
    expect(url).toContain("access_token=TOKEN%201"); // url-encoded
    const parsed = JSON.parse(body);
    expect(parsed.recipient.id).toBe("PSID9");
    expect(parsed.message.text).toBe("hi");
    expect(parsed.messaging_type).toBe("RESPONSE");
  });

  it("truncates text to the 2000-char Messenger limit", () => {
    const { body } = buildSendRequest("P", "x".repeat(2500), "T");
    expect(JSON.parse(body).message.text.length).toBe(2000);
  });
});
