import { describe, expect, it } from "vitest";
import { redactPii, scrubEvent } from "@/lib/sentry/scrub";

describe("redactPii", () => {
  it("redacts a residence card number", () => {
    expect(redactPii("card is AB12345678CD ok")).toBe(
      "card is [REDACTED_zairyu_card] ok",
    );
  });

  it("redacts an email address", () => {
    expect(redactPii("mail me at taro@example.com")).toBe(
      "mail me at [REDACTED_email]",
    );
  });

  it("redacts a Japanese phone number", () => {
    expect(redactPii("call 090-1234-5678")).toBe("call [REDACTED_phone_jp]");
  });

  it("redacts every occurrence of the same PII", () => {
    expect(redactPii("a@b.com and a@b.com")).toBe(
      "[REDACTED_email] and [REDACTED_email]",
    );
  });

  it("leaves clean text untouched (and returns the same content)", () => {
    const clean = "在留資格の更新には何が必要ですか？";
    expect(redactPii(clean)).toBe(clean);
  });
});

describe("scrubEvent", () => {
  it("redacts PII in a Sentry-shaped event (message, exception, request, breadcrumbs)", () => {
    const event = {
      event_id: "abc123",
      message: "user said my card AB12345678CD",
      exception: {
        values: [
          { type: "Error", value: "failed for taro@example.com" },
        ],
      },
      request: {
        data: { body: "phone 090-1234-5678" },
        query_string: "q=clean",
      },
      breadcrumbs: [
        { message: "navigated" },
        { message: "typed AB99887766ZZ" },
      ],
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.message).toBe("user said my card [REDACTED_zairyu_card]");
    expect(scrubbed.exception.values[0].value).toBe(
      "failed for [REDACTED_email]",
    );
    expect(scrubbed.request.data.body).toBe("phone [REDACTED_phone_jp]");
    // Non-PII fields are preserved verbatim.
    expect(scrubbed.event_id).toBe("abc123");
    expect(scrubbed.request.query_string).toBe("q=clean");
    expect(scrubbed.breadcrumbs[0].message).toBe("navigated");
    expect(scrubbed.breadcrumbs[1].message).toBe("typed [REDACTED_zairyu_card]");
  });

  it("handles null / undefined / numbers / booleans without throwing", () => {
    const event = {
      a: null,
      b: undefined,
      c: 42,
      d: true,
      e: "clean string",
    };
    expect(scrubEvent(event)).toEqual(event);
  });

  it("does not blow the stack on a deeply nested object", () => {
    let nested: Record<string, unknown> = { leaf: "a@b.com" };
    for (let i = 0; i < 50; i++) nested = { child: nested };
    expect(() => scrubEvent(nested)).not.toThrow();
  });
});
