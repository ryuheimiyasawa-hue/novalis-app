// Disclaimer + escalation copy. Inlined here in D-5 for use by the
// chat pipeline; D-6 lifts these into messages/{ja,en,tl}.json so they
// flow through next-intl alongside the rest of the UI strings.
//
// Why hardcoded for one phase: the pipeline cannot import client
// `useTranslations()` from a server-side module, and the next-intl
// server hook needs the locale at request time. We bridge by exposing
// the same shape twice (here, then via next-intl) so the move in D-6
// is a localized refactor with no behavior change.

import type { WhitelistLocale } from "./whitelist-keywords";

// Disclaimer appended to every successful AI answer.
export const ANSWER_DISCLAIMER: Record<WhitelistLocale, string> = {
  ja: "これは一般的な情報であり、個別の判断は専門家にご相談ください。",
  en: "This is general information. Please consult a professional for your specific situation.",
  tl: "Ito ay pangkalahatang impormasyon lamang. Mangyaring kumonsulta sa isang propesyonal para sa inyong partikular na sitwasyon.",
};

// Body shown when the pipeline routes the user to a human expert
// (keyword Whitelist, LLM individual verdict, LLM failsafe, safety
// block). The actual expert directory is appended by the API layer.
export const ESCALATION_MESSAGE: Record<WhitelistLocale, string> = {
  ja: "ご質問の内容は個別の状況に応じた専門的な判断が必要なため、専門家にご相談されることをお勧めします。Novalis 提携の士業窓口を以下にご紹介します。",
  en: "Your question requires professional judgment based on your specific situation. We recommend consulting an expert. Novalis-affiliated professionals are listed below.",
  tl: "Ang inyong tanong ay nangangailangan ng propesyonal na pag-aaral batay sa inyong partikular na sitwasyon. Inirerekomenda namin na kumonsulta sa isang eksperto. Nasa ibaba ang mga propesyonal na kasama ng Novalis.",
};

// Body shown when input is refused at the gate (PII detected, message
// too long). Encourages a rephrase rather than escalating.
export const PII_BLOCK_MESSAGE: Record<WhitelistLocale, string> = {
  ja: "個人情報（在留カード番号・パスポート番号・電話番号・メールアドレスなど）はチャットに送信できません。お手数ですが、個人情報を含めずに質問を書き直してください。",
  en: "Personal information (residence card number, passport number, phone number, email, etc.) cannot be sent through chat. Please rephrase your question without including personal information.",
  tl: "Hindi maaaring ipadala sa chat ang personal na impormasyon (residence card number, passport number, phone number, email, atbp.). Mangyaring isulat muli ang inyong tanong nang walang kasamang personal na impormasyon.",
};

export const TOO_LONG_MESSAGE: Record<WhitelistLocale, string> = {
  ja: "質問が長すぎます。2000 文字以内で書き直してください。",
  en: "Your message is too long. Please keep it under 2000 characters.",
  tl: "Masyadong mahaba ang inyong mensahe. Mangyaring panatilihin itong wala pang 2000 karakter.",
};
