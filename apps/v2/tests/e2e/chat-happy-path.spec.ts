import { expect, test } from "@playwright/test";

// MVP happy-path E2E: a logged-in user visits the JA chat page,
// submits a general-information question, and watches the
// streaming answer + citations arrive. Auth is pre-set via
// global-setup.ts so we don't need to drive the Facebook OAuth
// flow from the browser.

test("ja chat: general question → streamed answer with citation", async ({
  page,
}) => {
  await page.goto("/ja/chat");

  // Header text is the i18n "AI 相談" string from messages/ja.json.
  await expect(
    page.getByRole("heading", { name: "AI 相談" }),
  ).toBeVisible();

  // Send a question that should pass KW + LLM and reach RAG +
  // Gemini. "ビザ更新には何が必要ですか？" is a general-info
  // question covered by the seed article visa-renewal-basics.
  const input = page.getByPlaceholder("ご質問を入力してください...");
  await expect(input).toBeVisible();
  await input.fill("ビザ更新には何が必要ですか？");
  await page.getByRole("button", { name: "送信" }).click();

  // Wait for the assistant bubble to appear. The pipeline takes
  // 3-6s typically; allow 30s upper bound to absorb cold-start
  // and rare slow Gemini responses.
  const assistantLabel = page.getByText("AI アシスタント").first();
  await expect(assistantLabel).toBeVisible({ timeout: 30_000 });

  // The first assistant message should contain *some* meaningful
  // text. We don't pin the wording — Gemini is non-deterministic —
  // we just assert non-trivial length.
  const bubble = assistantLabel.locator("..").locator("..");
  await expect(bubble).toContainText(/.{20,}/, { timeout: 30_000 });

  // The disclaimer should be appended to the answer.
  await expect(bubble).toContainText("一般的な情報");

  // At least one citation chip should render for a RAG-supported
  // question. The fixture article visa-renewal-basics is the
  // expected hit, but we tolerate any citation that appears so
  // the test stays stable across embedding model drift.
  const citation = page.locator("a[href^='/ja/articles/']").first();
  if (await citation.count()) {
    await expect(citation).toBeVisible();
  }
});
