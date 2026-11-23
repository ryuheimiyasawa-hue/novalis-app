// Replies to a Messenger sender who has not linked a MORITA account yet.
// Tagalog first, then English and Japanese: the profile locale cannot be read
// before linking, and people arriving from the flyer QR code mostly read
// Tagalog or English.

export function unlinkedGuidance(appUrl: string): string {
  return [
    "Kumusta! Para magamit ang MORITA dito sa Messenger, i-link muna ang account mo.",
    `1. Buksan ang ${appUrl}/tl/messenger at mag-log in (Facebook o email).`,
    "2. Ipadala dito ang 6-digit na code na lalabas.",
    "",
    `English: open ${appUrl}/en/messenger, sign in, then send the 6-digit code here.`,
    "",
    `日本語: ${appUrl}/ja/messenger を開いてログインし、表示された6桁の連携コードをこのトークに送ってください。`,
  ].join("\n");
}

export const LINKED_REPLY = [
  "Naka-link na! Magtanong lang tungkol sa buhay sa Japan.",
  "Linked! Ask anything about life in Japan.",
  "連携が完了しました。日本での生活に関するご質問をお気軽にどうぞ。",
].join("\n");

export const LINK_ERROR_REPLY = [
  "May error sa pag-link. Subukan ulit mamaya.",
  "Linking failed. Please try again later.",
  "連携処理でエラーが発生しました。時間を置いてもう一度お試しください。",
].join("\n");

export const INVALID_CODE_PREFIX = [
  "Mali o expired na ang code.",
  "The code is invalid or expired.",
  "コードが無効か、有効期限が切れています。",
].join("\n");
