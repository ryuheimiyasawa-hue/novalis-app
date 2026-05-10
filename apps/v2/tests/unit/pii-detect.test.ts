import { describe, expect, it } from "vitest";
import { detectPii, summarisePiiHits } from "@/lib/pii/detect";

const types = (input: string) => detectPii(input).map((h) => h.type);

describe("detectPii — 在留カード番号 (zairyu_card)", () => {
  it("detects a card number embedded in a sentence", () => {
    expect(types("私の在留カード番号は AB12345678CD です")).toContain(
      "zairyu_card",
    );
  });

  it("detects standalone card number", () => {
    expect(types("AB12345678CD")).toContain("zairyu_card");
  });

  it("does not match lowercase or wrong shape", () => {
    expect(types("ab12345678cd")).not.toContain("zairyu_card");
    expect(types("AB1234567CD")).not.toContain("zairyu_card"); // 7 digits not 8
  });
});

describe("detectPii — passport (passport_jp)", () => {
  it("detects current-format Japanese passport (2 letters + 7 digits)", () => {
    expect(types("Passport: TZ1234567 expires next year")).toContain(
      "passport_jp",
    );
  });

  it("detects older format (1 letter + 8 digits)", () => {
    expect(types("ID was M12345678")).toContain("passport_jp");
  });

  it("does not match a date or year", () => {
    expect(types("In 2025 I came to Japan")).not.toContain("passport_jp");
  });
});

describe("detectPii — マイナンバー (my_number)", () => {
  it("detects exactly 12 consecutive digits", () => {
    expect(types("My number is 123456789012")).toContain("my_number");
  });

  it("does not match a 13-digit number", () => {
    expect(types("Code 1234567890123")).not.toContain("my_number");
  });

  it("does not match an 11-digit number", () => {
    expect(types("Phone 12345678901")).not.toContain("my_number");
  });

  it("does not match a hyphenated 12-digit number (intentional MVP gap)", () => {
    // We document this as a known gap rather than over-matching.
    expect(types("1234-5678-9012")).not.toContain("my_number");
  });
});

describe("detectPii — Japanese phone numbers (phone_jp)", () => {
  it("detects mobile with hyphens", () => {
    expect(types("Call me at 090-1234-5678")).toContain("phone_jp");
  });

  it("detects landline with hyphens", () => {
    expect(types("Office: 03-1234-5678")).toContain("phone_jp");
  });

  it("detects 11 continuous digits starting with 0", () => {
    expect(types("番号 09012345678 まで")).toContain("phone_jp");
  });

  it("does not match a non-Japanese-shaped number", () => {
    expect(types("Reference 1234567890")).not.toContain("phone_jp");
  });
});

describe("detectPii — email", () => {
  it("detects a typical email", () => {
    expect(types("Contact me at user@example.com please")).toContain("email");
  });

  it("detects an email with plus addressing", () => {
    expect(types("billing+vat@novalis.ph")).toContain("email");
  });

  it("does not match a stray @ in normal text", () => {
    expect(types("Meet @ Shibuya station")).not.toContain("email");
  });
});

describe("detectPii — composite + summary", () => {
  it("returns multiple hits for a message containing several PII types", () => {
    const hits = detectPii(
      "在留カード AB12345678CD、電話 090-1234-5678、メール me@example.com",
    );
    const summary = summarisePiiHits(hits);
    expect(summary.types).toContain("zairyu_card");
    expect(summary.types).toContain("phone_jp");
    expect(summary.types).toContain("email");
    expect(summary.count).toBeGreaterThanOrEqual(3);
  });

  it("is empty for benign input", () => {
    const hits = detectPii(
      "在留資格の更新には何が必要ですか？申請場所も教えてください。",
    );
    expect(hits).toEqual([]);
  });

  it("does not double-count the same substring under one type", () => {
    const hits = detectPii("AB12345678CD AB12345678CD");
    const cardHits = hits.filter((h) => h.type === "zairyu_card");
    // Same string deduplicated; the second occurrence is silently skipped.
    expect(cardHits.length).toBe(1);
  });

  it("counts distinct strings of the same type separately", () => {
    const hits = detectPii("AB12345678CD and CD87654321AB");
    const cardHits = hits.filter((h) => h.type === "zairyu_card");
    expect(cardHits.length).toBe(2);
  });
});
