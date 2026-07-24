export type ConvChannel = "web" | "messenger";
export type ConvMode = "auto" | "operator";
export type MsgRole = "user" | "assistant" | "operator" | "system";

export interface ConversationListRow {
  id: string;
  title: string | null;
  channel: ConvChannel;
  mode: ConvMode;
  user_id: string;
  display_name: string | null;
  message_count: number;
  updated_at: string;
}

export interface ConversationMessageRow {
  id: string;
  role: MsgRole;
  content: string;
  is_escalated: boolean;
  created_at: string;
}

export const CHANNEL_LABEL: Record<ConvChannel, string> = {
  web: "Web",
  messenger: "Messenger",
};

export const MODE_LABEL: Record<ConvMode, string> = {
  auto: "AI自動",
  operator: "運営対応",
};

export const ROLE_LABEL: Record<MsgRole, string> = {
  user: "利用者",
  assistant: "AI",
  operator: "運営",
  system: "システム",
};
