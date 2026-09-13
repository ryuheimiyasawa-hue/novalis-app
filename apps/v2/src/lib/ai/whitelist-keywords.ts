// Stage 1 of the two-stage Whitelist (master plan §2-2): zero-cost
// regex pass that flags messages whose surface form is clearly about
// the user's own situation. Anything that hits here is escalated to a
// human expert without ever reaching Gemini.
//
// Bias: tilt toward false positives. The cost of an unnecessary
// escalation is a small UX wrinkle ("please consult a professional");
// the cost of a missed escalation is the system answering an
// individual legal / immigration / labour question, which can violate
// 弁護士法 / 行政書士法 / etc. Conservative wins.
//
// Why some entries look short: Japanese has no whitespace between
// words, so we cannot use \b. We rely on the strong personal-pronoun
// nature of words like "私" / "うち" to avoid noise. ASCII patterns
// use \b to keep "my" out of "Tommy".
//
// Locale coverage is uneven by design — the seed set leans heavily
// Japanese because the early operator base is JA-fluent. Tagalog
// patterns are a starter; we expect to extend them once Filipino
// beta testers in W9-10 surface real phrasings.

export type WhitelistLocale = "ja" | "en" | "tl";

export interface KeywordHit {
  /** Locale whose pattern fired. */
  locale: WhitelistLocale;
  /** Human-readable keyword label, used in logs and audit. */
  keyword: string;
  /** The exact substring from the user message that matched. */
  match: string;
}

interface Pattern {
  keyword: string;
  re: RegExp;
}

// Stage1 carries ONLY high-precision triggers — phrases that, when they
// appear, almost certainly require a licensed professional. Bare
// first-person pronouns (私は / うちの / etc.) and bare time markers
// (先月 / 今月) used to live here, but they fired on every harmless
// "I'm a bit worried lately" and pushed the user to escalation before
// they had a chance to clarify. Those judgments now belong to the LLM
// classifier in stage 2, which can read intent, not just surface form.
// Conservative bias is preserved at stage 2 via prompt design.
const JA_PATTERNS: Pattern[] = [
  // Charged words that signal the user is *in* a situation, not asking
  // about the law in the abstract.
  { keyword: "請求できますか", re: /請求できますか/ },
  { keyword: "訴えたい", re: /訴えたい/ },
  { keyword: "訴えられ", re: /訴えられ/ },
  { keyword: "離婚したい", re: /離婚したい/ },
  { keyword: "離婚する", re: /離婚する/ },
  // Stem-only match so polite (解雇されました), continuous (解雇されて),
  // and plain (解雇された) all hit. The bare noun 解雇 alone would
  // false-trigger on general questions ("解雇予告とは"), so we anchor
  // on the passive auxiliary され.
  { keyword: "解雇され", re: /解雇され/ },
  { keyword: "クビになっ", re: /クビにな/ },
  { keyword: "パワハラ", re: /パワハラ/ },
  { keyword: "セクハラ", re: /セクハラ/ },
  { keyword: "DV", re: /DV/ },
  // Visa / period expressions tied to the asker's own status.
  { keyword: "在留期限が", re: /在留期限が/ },
  { keyword: "期限が切れ", re: /期限が切れ/ },
  { keyword: "オーバーステイ", re: /オーバーステイ/ },
  // Money owed / unpaid — typically a personal claim.
  { keyword: "滞納", re: /滞納/ },
  { keyword: "未払い", re: /未払い/ },
  // --- 税務 (lawyer review 2026-08-10, §3-3) -------------------------
  // 税理士法は他士業より線が厳しい。経費判定・所得区分の振り分け・申告
  // 義務の有無の判定は独占業務に抵触すると明示された。逆に、期限・提出
  // 先・提出方法・必要書類の案内と、確定申告と年末調整の制度上の違いの
  // 説明は一般情報として返してよい。だからここで拾うのは「判定を求める
  // 形」だけで、「いつ・どこに・何を」を尋ねる形は素通しさせる。
  { keyword: "経費になりますか", re: /経費に(なり|でき|計上)/ },
  { keyword: "経費で落とせますか", re: /経費で落と/ },
  { keyword: "申告が必要ですか", re: /申告(が|は)必要/ },
  { keyword: "申告しないと", re: /申告(を)?し(ないと|なくて)/ },
  { keyword: "扶養に入れますか", re: /扶養に(入れ|入り|なれ)/ },
  {
    keyword: "所得区分の判定",
    re: /(雑所得|事業所得|給与所得|一時所得)(に|です)/,
  },

  // --- 個別紛争トリガー (lawyer review 2026-08-10, §3-4) -------------
  // 独占業務の外でも弁護士法72条の「法律事件」に当たりうる、と具体例を
  // 列挙された類型。退去強制手続の係属、在留不許可処分を争う、離婚に伴
  // う配偶者の在留資格、解雇の有効性、未払残業代の計算、労災の不支給決
  // 定への不服。解雇と離婚は上の既存パターンで既に拾えているため、ここ
  // では残りを埋める。
  { keyword: "退去強制", re: /退去強制|強制送還/ },
  { keyword: "収容", re: /収容され|入管に収容/ },
  { keyword: "不許可・不交付", re: /不許可|不交付|不認可/ },
  { keyword: "不服申立", re: /審査請求|異議申(立|し立)|不服申(立|し立)/ },
  { keyword: "残業代", re: /残業代/ },
  { keyword: "労災", re: /労災/ },
  { keyword: "調停・訴訟", re: /調停|訴訟|裁判/ },
];

const EN_PATTERNS: Pattern[] = [
  // First-person possessives followed by a domain noun. "my" alone is
  // too common ("my favourite cafe"), so we anchor it to the specific
  // topics this product touches.
  {
    keyword: "my <topic>",
    re: /\bmy\s+(visa|residence|husband|wife|spouse|child|kid|landlord|employer|boss|salary|wage|case|claim|situation|debt|loan|tax|application)\b/i,
  },
  // Direct "can I / should I" asks for personalised advice.
  {
    keyword: "can I sue/claim/file",
    re: /\bcan\s+i\s+(sue|claim|file|report|cancel|terminate|appeal)\b/i,
  },
  {
    keyword: "should I",
    re: /\bshould\s+i\s+(sue|file|report|sign|accept|refuse|leave|stay)\b/i,
  },
  // "I was fired / divorced / overcharged" - past-tense personal events.
  {
    keyword: "I was/got <verb>",
    re: /\bi\s+(was|got|am|have been)\s+(fired|laid off|sacked|divorced|overcharged|deported|denied|rejected|arrested|charged)\b/i,
  },
  // "I want to divorce / sue / leave"
  {
    keyword: "I want to <verb>",
    re: /\bi\s+want\s+to\s+(divorce|sue|leave|cancel|claim|appeal|extend|renew)\b/i,
  },
  // Visa expiry phrased about the user's own visa.
  { keyword: "my visa expir(ed|es)", re: /\bmy\s+visa\s+(expir(ed|es)|will expire)\b/i },
  // "How much do I owe / will I get" — personalised number.
  {
    keyword: "how much do/will I",
    re: /\bhow\s+much\s+(do|will|should)\s+i\b/i,
  },
  // --- Tax determinations (lawyer review 2026-08-10, §3-3) ----------
  // 税理士法 draws a harder line than the other professions: deciding
  // what is deductible, which income category something falls into,
  // and whether a given person must file are all reserved work.
  // Explaining deadlines, where to file, how to file, and what
  // documents are needed stays fine, so these anchor on the
  // determination verbs rather than on the word "tax".
  {
    keyword: "can I deduct/expense",
    re: /\bcan\s+i\s+(deduct|expense|write\s+off|claim)\b/i,
  },
  { keyword: "is it deductible", re: /\b(tax[- ]?)?deductible\b/i },
  {
    keyword: "do I have to file",
    re: /\b(do|does)\s+i\s+(have\s+to|need\s+to)\s+file\b|\bam\s+i\s+required\s+to\s+file\b/i,
  },
  { keyword: "am I a dependent", re: /\bam\s+i\s+(a\s+)?dependent\b/i },

  // --- Individual dispute triggers (lawyer review 2026-08-10, §3-4) --
  { keyword: "deportation", re: /\b(deport(ation|ed)?|removal\s+order)\b/i },
  { keyword: "detained", re: /\b(detained|detention\s+cent(er|re))\b/i },
  { keyword: "overtime pay", re: /\bovertime\s+pay\b/i },
  {
    keyword: "workers compensation",
    re: /\bworkers?[' ]?\s*comp(ensation)?\b|\blabou?r\s+accident\b/i,
  },
  { keyword: "appeal a decision", re: /\bappeal\s+(the|this|a|my)\s+(decision|denial|rejection|ruling)\b/i },
];

const TL_PATTERNS: Pattern[] = [
  // First-person pronouns.
  { keyword: "ako", re: /\bako\b/i },
  { keyword: "akin", re: /\b(akin|sa\s+akin)\b/i },
  { keyword: "ko", re: /\b(asawa|anak|amo|kaso|problema|trabaho|visa|sahod)\s+ko\b/i },
  // "How much" / personal asks.
  { keyword: "magkano", re: /\bmagkano\b/i },
  { keyword: "puwede ko bang", re: /\bpu(w|h)ede\s+ko\s+bang\b/i },
  // Personal events phrased in Tagalog.
  { keyword: "tinanggal sa trabaho", re: /\btinanggal\s+sa\s+trabaho\b/i },
  { keyword: "diniborsiyo", re: /\bdini[bv]orsiyo\b/i },
  { keyword: "ipa-extend", re: /\bipa-?extend\b/i },
  // --- Tax determinations (lawyer review 2026-08-10, §3-3) ----------
  { keyword: "kailangan ko bang mag-file", re: /\bkailangan\s+ko\s+bang\s+mag-?file\b/i },
  { keyword: "buwis", re: /\bbuwis\b/i },
  { keyword: "dependent/umaasa", re: /\bdependent\b/i },

  // --- Individual dispute triggers (lawyer review 2026-08-10, §3-4) --
  { keyword: "deport", re: /\bdeport(ed|asyon)?\b/i },
  { keyword: "overtime", re: /\bovertime\b/i },
  { keyword: "tinanggihan", re: /\btinanggihan\b/i },
  { keyword: "kaso sa korte", re: /\b(korte|husgado|demanda)\b/i },
];

const PATTERNS_BY_LOCALE: Record<WhitelistLocale, Pattern[]> = {
  ja: JA_PATTERNS,
  en: EN_PATTERNS,
  tl: TL_PATTERNS,
};

/**
 * Scan the message for first-person / personal-situation keywords and
 * return the FIRST hit found (early-exit; we don't need every match for
 * the routing decision). Returns null when nothing fires — the message
 * then falls through to the LLM self-judge in stage 2.
 *
 * The locale hint comes from the user's preferred_language and tells
 * us which patterns to try; mixed-language messages still work because
 * we only run the matching set.
 */
export function detectIndividualKeywords(
  message: string,
  locale: WhitelistLocale,
): KeywordHit | null {
  const patterns = PATTERNS_BY_LOCALE[locale];
  for (const { keyword, re } of patterns) {
    const m = re.exec(message);
    if (m) {
      return { locale, keyword, match: m[0] };
    }
  }
  return null;
}
