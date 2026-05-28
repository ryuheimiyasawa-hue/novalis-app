import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gemini", () => ({
  generate: vi.fn(),
}));

import { generate } from "@/lib/ai/gemini";
import { generateConversationTitle, sanitizeTitle } from "@/lib/chat/title";

const mockGenerate = vi.mocked(generate);

function genResult(text: string) {
  return {
    text,
    model: "gemini-2.5-flash",
    tokensIn: 10,
    tokensOut: 5,
    latencyMs: 1,
    finishReason: "STOP" as const,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sanitizeTitle", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeTitle("  在留資格の\n更新について  ")).toBe(
      "在留資格の 更新について",
    );
  });

  it("strips wrapping ASCII and Japanese quotes", () => {
    expect(sanitizeTitle('"Visa renewal"')).toBe("Visa renewal");
    expect(sanitizeTitle("「在留資格の更新」")).toBe("在留資格の更新");
    expect(sanitizeTitle("『健康保険』")).toBe("健康保険");
  });

  it("removes a leading Title:/タイトル: prefix the model sometimes adds", () => {
    expect(sanitizeTitle("タイトル: 在留資格の更新")).toBe("在留資格の更新");
    expect(sanitizeTitle("Title: Visa renewal")).toBe("Visa renewal");
    expect(sanitizeTitle("Pamagat: Visa")).toBe("Visa");
  });

  it("clamps to 40 characters", () => {
    const long = "あ".repeat(60);
    expect(sanitizeTitle(long)).toHaveLength(40);
  });
});

describe("generateConversationTitle", () => {
  it("returns a sanitized title on success", async () => {
    mockGenerate.mockResolvedValue(genResult('"在留資格の更新"'));
    const title = await generateConversationTitle(
      "在留資格を更新したいのですが手続きを教えてください",
      "ja",
    );
    expect(title).toBe("在留資格の更新");
    expect(mockGenerate).toHaveBeenCalledOnce();
  });

  it("returns null for a blank message without calling Gemini", async () => {
    const title = await generateConversationTitle("   ", "en");
    expect(title).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns null when the model yields an empty title", async () => {
    mockGenerate.mockResolvedValue(genResult("   "));
    const title = await generateConversationTitle("hello", "en");
    expect(title).toBeNull();
  });

  it("returns null (never throws) when Gemini errors", async () => {
    mockGenerate.mockRejectedValue(new Error("quota exceeded"));
    const title = await generateConversationTitle("kumusta", "tl");
    expect(title).toBeNull();
  });

  it("truncates the source message to 500 chars before prompting", async () => {
    mockGenerate.mockResolvedValue(genResult("long question"));
    await generateConversationTitle("x".repeat(2000), "en");
    const prompt = mockGenerate.mock.calls[0][0] as string;
    // prompt = locale preamble + sliced message. The preamble itself
    // contains stray "x" chars (e.g. "text"), so take the LONGEST run —
    // that is the sliced message, which must be capped at 500.
    const runs = prompt.match(/x+/g) ?? [];
    const longest = Math.max(...runs.map((r) => r.length));
    expect(longest).toBe(500);
  });
});
