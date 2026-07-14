import { z } from "zod";

// Validation for the first-party inquiries feature (P2-M, Feature A).
// Lives in its own folder because it spans two surfaces: the public
// create endpoint (/api/inquiries) and the admin status endpoint
// (/api/admin/inquiries/[id]). Kept together so the allowed status
// values have a single source of truth.

// Mirrors the DB CHECK on inquiries.status.
export const InquiryStatusEnum = z.enum([
  "pending",
  "contacted",
  "resolved",
  "closed",
]);
export type InquiryStatus = z.infer<typeof InquiryStatusEnum>;

// User-submitted contact form. subject/message mirror the NOT NULL DB
// columns; contact_email is required here (the DB allows null) because
// without it staff have no way to reply to the person.
export const InquiryCreateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5_000),
  contact_email: z.string().trim().email().max(254),
});
export type InquiryCreateInput = z.infer<typeof InquiryCreateSchema>;

// Admin PATCH: the only thing an operator changes is the status as they
// work the inbox (pending -> contacted -> resolved / closed).
export const InquiryUpdateSchema = z.object({
  status: InquiryStatusEnum,
});
export type InquiryUpdateInput = z.infer<typeof InquiryUpdateSchema>;

// Inbox list filter.
export const InquiryListQuerySchema = z.object({
  status: InquiryStatusEnum.optional(),
});
