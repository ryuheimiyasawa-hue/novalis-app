import { describe, expect, it } from "vitest";
import {
  articleLocaleInputs,
  faqLocaleInputs,
} from "@/lib/ai/reindex";

describe("articleLocaleInputs", () => {
  it("includes every locale that has a non-empty body", () => {
    const out = articleLocaleInputs({
      title_ja: "在留資格",
      title_en: "Residency",
      title_tl: "Paninirahan",
      body_ja: "日本語の本文",
      body_en: "English body",
      body_tl: "Katawan ng Tagalog",
    });
    expect(out.map((l) => l.language)).toEqual(["ja", "en", "tl"]);
  });

  it("skips locales whose body is null (untranslated)", () => {
    const out = articleLocaleInputs({
      title_ja: "在留資格",
      title_en: "Residency",
      title_tl: null,
      body_ja: "日本語の本文",
      body_en: null,
      body_tl: null,
    });
    expect(out.map((l) => l.language)).toEqual(["ja"]);
  });

  it("skips locales whose body is whitespace-only", () => {
    const out = articleLocaleInputs({
      title_ja: "在留資格",
      title_en: "Residency",
      title_tl: null,
      body_ja: "日本語の本文",
      body_en: "   \n  ",
      body_tl: null,
    });
    expect(out.map((l) => l.language)).toEqual(["ja"]);
  });

  it("defaults a missing title to empty string for an embeddable locale", () => {
    const out = articleLocaleInputs({
      title_ja: "在留資格",
      title_en: null,
      title_tl: null,
      body_ja: "日本語の本文",
      body_en: "English body present, title missing",
      body_tl: null,
    });
    const en = out.find((l) => l.language === "en");
    expect(en).toBeDefined();
    expect(en?.title).toBe("");
  });
});

describe("faqLocaleInputs", () => {
  it("includes a locale only when BOTH question and answer are present", () => {
    const out = faqLocaleInputs({
      question_ja: "質問",
      question_en: "Question",
      question_tl: "Tanong",
      answer_ja: "答え",
      answer_en: "Answer",
      answer_tl: null, // answer missing -> tl excluded
    });
    expect(out.map((l) => l.language)).toEqual(["ja", "en"]);
  });

  it("excludes a locale with a question but no answer", () => {
    const out = faqLocaleInputs({
      question_ja: "質問",
      question_en: "Question only",
      question_tl: null,
      answer_ja: "答え",
      answer_en: null,
      answer_tl: null,
    });
    expect(out.map((l) => l.language)).toEqual(["ja"]);
  });

  it("always includes ja (NOT NULL columns)", () => {
    const out = faqLocaleInputs({
      question_ja: "質問",
      question_en: null,
      question_tl: null,
      answer_ja: "答え",
      answer_en: null,
      answer_tl: null,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      language: "ja",
      question: "質問",
      answer: "答え",
    });
  });
});
