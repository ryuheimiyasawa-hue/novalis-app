// ISO 3166-2:JP code + Japanese / English labels for the 47 prefectures.
// `tl` falls back to `en` (Tagalog has no native rendering for Japanese
// place names; English romanization is the local convention).

export interface PrefectureLabel {
  code: string;
  ja: string;
  en: string;
}

export const PREFECTURES: ReadonlyArray<PrefectureLabel> = [
  { code: "JP-01", ja: "北海道", en: "Hokkaido" },
  { code: "JP-02", ja: "青森県", en: "Aomori" },
  { code: "JP-03", ja: "岩手県", en: "Iwate" },
  { code: "JP-04", ja: "宮城県", en: "Miyagi" },
  { code: "JP-05", ja: "秋田県", en: "Akita" },
  { code: "JP-06", ja: "山形県", en: "Yamagata" },
  { code: "JP-07", ja: "福島県", en: "Fukushima" },
  { code: "JP-08", ja: "茨城県", en: "Ibaraki" },
  { code: "JP-09", ja: "栃木県", en: "Tochigi" },
  { code: "JP-10", ja: "群馬県", en: "Gunma" },
  { code: "JP-11", ja: "埼玉県", en: "Saitama" },
  { code: "JP-12", ja: "千葉県", en: "Chiba" },
  { code: "JP-13", ja: "東京都", en: "Tokyo" },
  { code: "JP-14", ja: "神奈川県", en: "Kanagawa" },
  { code: "JP-15", ja: "新潟県", en: "Niigata" },
  { code: "JP-16", ja: "富山県", en: "Toyama" },
  { code: "JP-17", ja: "石川県", en: "Ishikawa" },
  { code: "JP-18", ja: "福井県", en: "Fukui" },
  { code: "JP-19", ja: "山梨県", en: "Yamanashi" },
  { code: "JP-20", ja: "長野県", en: "Nagano" },
  { code: "JP-21", ja: "岐阜県", en: "Gifu" },
  { code: "JP-22", ja: "静岡県", en: "Shizuoka" },
  { code: "JP-23", ja: "愛知県", en: "Aichi" },
  { code: "JP-24", ja: "三重県", en: "Mie" },
  { code: "JP-25", ja: "滋賀県", en: "Shiga" },
  { code: "JP-26", ja: "京都府", en: "Kyoto" },
  { code: "JP-27", ja: "大阪府", en: "Osaka" },
  { code: "JP-28", ja: "兵庫県", en: "Hyogo" },
  { code: "JP-29", ja: "奈良県", en: "Nara" },
  { code: "JP-30", ja: "和歌山県", en: "Wakayama" },
  { code: "JP-31", ja: "鳥取県", en: "Tottori" },
  { code: "JP-32", ja: "島根県", en: "Shimane" },
  { code: "JP-33", ja: "岡山県", en: "Okayama" },
  { code: "JP-34", ja: "広島県", en: "Hiroshima" },
  { code: "JP-35", ja: "山口県", en: "Yamaguchi" },
  { code: "JP-36", ja: "徳島県", en: "Tokushima" },
  { code: "JP-37", ja: "香川県", en: "Kagawa" },
  { code: "JP-38", ja: "愛媛県", en: "Ehime" },
  { code: "JP-39", ja: "高知県", en: "Kochi" },
  { code: "JP-40", ja: "福岡県", en: "Fukuoka" },
  { code: "JP-41", ja: "佐賀県", en: "Saga" },
  { code: "JP-42", ja: "長崎県", en: "Nagasaki" },
  { code: "JP-43", ja: "熊本県", en: "Kumamoto" },
  { code: "JP-44", ja: "大分県", en: "Oita" },
  { code: "JP-45", ja: "宮崎県", en: "Miyazaki" },
  { code: "JP-46", ja: "鹿児島県", en: "Kagoshima" },
  { code: "JP-47", ja: "沖縄県", en: "Okinawa" },
];

export const PREFECTURE_CODE_RE = /^JP-\d{2}$/;

export function getPrefectureLabel(
  code: string,
  language: "ja" | "en" | "tl",
): string | null {
  const found = PREFECTURES.find((p) => p.code === code);
  if (!found) return null;
  // Tagalog uses the English romanization for place names.
  return language === "ja" ? found.ja : found.en;
}
