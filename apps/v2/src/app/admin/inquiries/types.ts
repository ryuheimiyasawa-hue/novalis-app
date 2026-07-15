import type { InquiryStatus } from "@/lib/inquiries/schema";

export interface InquiryListRow {
  id: string;
  subject: string;
  status: InquiryStatus;
  contact_email: string | null;
  created_at: string;
  user_id: string;
  display_name: string | null;
}

export interface InquiryFull {
  id: string;
  subject: string;
  message: string;
  contact_email: string | null;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
  user_id: string;
  display_name: string | null;
}

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  pending: "未対応",
  contacted: "連絡済み",
  resolved: "解決済み",
  closed: "クローズ",
};

export const STATUS_ORDER: InquiryStatus[] = [
  "pending",
  "contacted",
  "resolved",
  "closed",
];
