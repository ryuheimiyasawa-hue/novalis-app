// Server-side accessor for the chat copy that lives in
// `messages/{ja,en,tl}.json` under the `chat` namespace. Importing the
// JSON files directly keeps the chat-pipeline a synchronous library
// function (no need to await next-intl helpers from a server module),
// while client components in W5 reach the same strings via
// next-intl's `useTranslations("chat")`.
//
// Single source of truth: messages/*.json. If the strings drift in
// only one place, this file fails to compile (key check below).

import jaMessages from "@/messages/ja.json";
import enMessages from "@/messages/en.json";
import tlMessages from "@/messages/tl.json";
import type { WhitelistLocale } from "./whitelist-keywords";

interface ChatCopy {
  disclaimer: string;
  escalation: string;
  piiBlock: string;
  tooLong: string;
}

const COPY: Record<WhitelistLocale, ChatCopy> = {
  ja: jaMessages.chat,
  en: enMessages.chat,
  tl: tlMessages.chat,
};

export function getAnswerDisclaimer(locale: WhitelistLocale): string {
  return COPY[locale].disclaimer;
}

export function getEscalationMessage(locale: WhitelistLocale): string {
  return COPY[locale].escalation;
}

export function getPiiBlockMessage(locale: WhitelistLocale): string {
  return COPY[locale].piiBlock;
}

export function getTooLongMessage(locale: WhitelistLocale): string {
  return COPY[locale].tooLong;
}
