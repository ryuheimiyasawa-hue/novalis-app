import { describe, expect, it } from "vitest";
import {
  InquiryCreateSchema,
  InquiryUpdateSchema,
  InquiryListQuerySchema,
} from "@/lib/inquiries/schema";

const validBody = {
  subject: "在留資格の更新について",
  message: "更新の必要書類を教えてください。",
  contact_email: "user@example.com",
};

describe("InquiryCreateSchema", () => {
  it("accepts a valid submission", () => {
    expect(InquiryCreateSchema.safeParse(validBody).success).toBe(true);
  });

  it("trims and rejects a whitespace-only subject", () => {
    expect(
      InquiryCreateSchema.safeParse({ ...validBody, subject: "   " }).success,
    ).toBe(false);
  });

  it("rejects a missing message", () => {
    expect(
      InquiryCreateSchema.safeParse({
        subject: validBody.subject,
        contact_email: validBody.contact_email,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      InquiryCreateSchema.safeParse({ ...validBody, contact_email: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("rejects a subject over 200 chars", () => {
    expect(
      InquiryCreateSchema.safeParse({ ...validBody, subject: "あ".repeat(201) })
        .success,
    ).toBe(false);
  });

  it("rejects a message over 5000 chars", () => {
    expect(
      InquiryCreateSchema.safeParse({ ...validBody, message: "a".repeat(5001) })
        .success,
    ).toBe(false);
  });
});

describe("InquiryUpdateSchema", () => {
  it("accepts each valid status", () => {
    for (const status of ["pending", "contacted", "resolved", "closed"]) {
      expect(InquiryUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(InquiryUpdateSchema.safeParse({ status: "spam" }).success).toBe(false);
  });

  it("rejects a missing status", () => {
    expect(InquiryUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("InquiryListQuerySchema", () => {
  it("accepts a status filter", () => {
    expect(InquiryListQuerySchema.safeParse({ status: "pending" }).success).toBe(
      true,
    );
  });

  it("accepts an empty query (no filter)", () => {
    expect(InquiryListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown status filter", () => {
    expect(InquiryListQuerySchema.safeParse({ status: "nope" }).success).toBe(
      false,
    );
  });
});
