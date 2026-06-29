import { generate } from "@/lib/ai/gemini";

// Auto-title a new conversation from its first user message. Mirrors
// the ChatGPT/Claude pattern: a one-shot summary the operator and the
// user can scan in the sidebar / metrics table instead of "(無題)".
//
// Cost: one Gemini 2.5 Flash call per NEW conversation, thinkingBudget=0,
// ~200 input + ~40 output tokens ≈ ¥0.003 per call. Negligible against
// the demo-phase ¥1,000/month marginal budget.
//
// Best-effort: any failure (timeout, quota, empty output) returns null
// and the caller leaves the title as-is. Never throws.

const MAX_TITLE_CHARS = 40;

const PROMPT_BY_LOCALE: Record<"ja" | "en" | "tl", string> = {
  ja: "次のユーザーの質問を、日本語の20文字以内の短いタイトルに要約してください。タイトル本文のみを出力し、引用符・句点・接頭辞（「タイトル:」など）は付けないでください。\n\n質問: ",
  en: "Summarize the following user question as a short English title of at most 6 words. Output only the title text — no quotes, trailing punctuation, or prefix.\n\nQuestion: ",
  tl: "Buurin ang sumusunod na tanong ng user sa isang maikling pamagat sa Tagalog na hindi hihigit sa 6 na salita. Ilabas lamang ang teksto ng pamagat — walang panipi, bantas sa dulo, o prefix.\n\nTanong: ",
};

export async function generateConversationTitle(
  firstUserMessage: string,
  locale: "ja" | "en" | "tl",
): Promise<string | null> {
  const trimmed = firstUserMessage.trim();
  if (trimmed.length === 0) return null;

  const prompt = PROMPT_BY_LOCALE[locale] + trimmed.slice(0, 500);
  try {
    const result = await generate(prompt, {
      temperature: 0.3,
      maxOutputTokens: 48,
      thinkingBudget: 0,
      maxAttempts: 1,
      timeoutMs: 8000,
    });
    const title = sanitizeTitle(result.text);
    return title.length > 0 ? title : null;
  } catch (err) {
    console.warn(
      `[chat] title generation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// Collapse whitespace, strip wrapping quotes / 「」『』 and a leading
// "タイトル:" / "Title:" prefix the model sometimes emits despite the
// instruction, then clamp length.
export function sanitizeTitle(raw: string): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  const deprefixed = oneLine.replace(/^(タイトル|title|pamagat)\s*[:：]\s*/i, "");
  const dequoted = deprefixed.replace(/^["'「『]+/, "").replace(/["'」』]+$/, "").trim();
  return dequoted.slice(0, MAX_TITLE_CHARS);
}
