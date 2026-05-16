import { describe, expect, it } from "vitest";
import { detectIndividualKeywords } from "@/lib/ai/whitelist-keywords";

describe("detectIndividualKeywords — ja", () => {
  // We assert escalation, not which specific keyword fired — pattern
  // order is an implementation detail and shifting it should not break
  // these tests. The keyword shape is exercised separately in the
  // "specific match" cases below.
  it.each([
    "先月、解雇されました",
    "訴えたいのですが可能ですか",
    "離婚したいです",
    "在留期限が来月切れます",
    "未払いの給料を請求できますか",
    "DV を受けています",
    "パワハラされました",
  ])("escalates: %s", (input) => {
    const hit = detectIndividualKeywords(input, "ja");
    expect(hit).not.toBeNull();
    expect(hit?.locale).toBe("ja");
  });

  it.each([
    ["離婚したいです", "離婚したい"],
    ["DV を受けています", "DV"],
    ["在留期限が今月で切れます", "在留期限が"],
  ])("matches the specific keyword: %s -> %s", (input, expected) => {
    const hit = detectIndividualKeywords(input, "ja");
    expect(hit?.keyword).toBe(expected);
  });

  it.each([
    // General-information questions — keyword stage must not fire.
    "在留資格の更新には何が必要ですか？",
    "ビザの種類を教えてください",
    "日本年金機構の受付時間はいつですか？",
    "離婚制度の概要を教えてください",
    "解雇予告の一般的な期間は？",
    // Soft personal narrative — handed to LLM stage, not auto-escalated.
    // Stage1 used to fire on bare 私は / 私の / 先月 / 来月; we removed
    // those patterns so vague "I'm worried" inputs reach the conversational
    // path instead of being short-circuited to escalation.
    "私のビザはいつ更新ですか？",
    "私は最近少し困っています",
    "うちの子の就学手続きについて知りたい",
    "来月、引っ越しを考えています",
  ])("does NOT escalate: %s", (input) => {
    const hit = detectIndividualKeywords(input, "ja");
    // Known accepted false positive: "DV相談ナビ" still fires the DV
    // keyword. We left that miss in place — safety > UX, and LLM stage
    // never sees it because keyword stage already escalated.
    expect(hit).toBeNull();
  });

  it("DV substring still escalates as a known accepted false positive", () => {
    const hit = detectIndividualKeywords("DV相談ナビとは何ですか？", "ja");
    expect(hit?.keyword).toBe("DV");
  });
});

describe("detectIndividualKeywords — en", () => {
  it.each([
    "Can I sue my employer for unpaid overtime?",
    "My visa expires next month",
    "I was fired last week",
    "I want to divorce my husband",
    "my landlord raised the rent suddenly",
    "how much do I owe in taxes?",
  ])("escalates: %s", (input) => {
    const hit = detectIndividualKeywords(input, "en");
    expect(hit).not.toBeNull();
    expect(hit?.locale).toBe("en");
  });

  it.each([
    ["my landlord raised the rent suddenly", "my <topic>"],
    ["I was fired last week", "I was/got <verb>"],
    ["how much do I owe in taxes?", "how much do/will I"],
  ])("matches the specific keyword: %s -> %s", (input, expected) => {
    const hit = detectIndividualKeywords(input, "en");
    expect(hit?.keyword).toBe(expected);
  });

  it.each([
    "How long is a working visa valid in Japan?",
    "What documents are required for a spouse visa?",
    "How does the Japanese pension system work for foreigners?",
    "Tell me about Tommy's restaurant", // 'my' inside Tommy must not match.
    "My favourite cafe in Shibuya", // 'my' alone, not anchored to a topic.
  ])("does NOT escalate: %s", (input) => {
    expect(detectIndividualKeywords(input, "en")).toBeNull();
  });
});

describe("detectIndividualKeywords — tl", () => {
  it.each([
    "Ako po ay overstay na",
    "Kaso ko ay tungkol sa visa",
    "Magkano ang pension ko?",
    "Tinanggal sa trabaho ako kahapon",
    "Diniborsiyo na kami",
  ])("escalates: %s", (input) => {
    const hit = detectIndividualKeywords(input, "tl");
    expect(hit).not.toBeNull();
    expect(hit?.locale).toBe("tl");
  });

  it.each([
    ["Ako po ay overstay na", "ako"],
    ["Diniborsiyo na kami", "diniborsiyo"],
  ])("matches the specific keyword: %s -> %s", (input, expected) => {
    const hit = detectIndividualKeywords(input, "tl");
    expect(hit?.keyword).toBe(expected);
  });

  it.each([
    "Anong dokumento ang kailangan para sa visa renewal?",
    "Ilang taon ba ang working visa?",
    "Asekuro - ano ang kailangan malaman?", // 'asekuro' is not 'ako' (boundary check).
  ])("does NOT escalate: %s", (input) => {
    expect(detectIndividualKeywords(input, "tl")).toBeNull();
  });
});

describe("detectIndividualKeywords — locale isolation", () => {
  it("only runs the patterns for the requested locale", () => {
    // English personal trigger; ja patterns should not match it.
    const hit = detectIndividualKeywords("My visa expires next month", "ja");
    expect(hit).toBeNull();
  });

  it("first hit wins (early exit)", () => {
    // After dropping the bare 私の pattern, the same input now hits
    // 離婚したい — same escalation outcome, different keyword label.
    const hit = detectIndividualKeywords("私の妻と離婚したいです", "ja");
    expect(hit?.keyword).toBe("離婚したい");
  });
});
