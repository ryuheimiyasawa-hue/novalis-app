import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  parseClassifierResponse,
  classifyIndividualLLM,
} from "@/lib/ai/whitelist-llm";

// Mock the Gemini transport so the orchestration tests never call the
// real API. The pure parser tests do not need a mock — they live in
// their own describe block above.
vi.mock("@/lib/ai/gemini", () => ({
  generate: vi.fn(),
}));

import { generate } from "@/lib/ai/gemini";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("parseClassifierResponse", () => {
  it("returns category=individual for valid individual JSON", () => {
    const r = parseClassifierResponse(
      '{"category": "individual", "reason": "user owns the visa"}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.category).toBe("individual");
      expect(r.reason).toBe("user owns the visa");
    }
  });

  it("returns category=general for valid general-info JSON", () => {
    const r = parseClassifierResponse(
      '{"category": "general", "reason": "asks about general visa rules"}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.category).toBe("general");
  });

  it("returns category=smalltalk for greeting / off-topic JSON", () => {
    const r = parseClassifierResponse(
      '{"category": "smalltalk", "reason": "greeting"}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.category).toBe("smalltalk");
  });

  it("failsafes on completely invalid JSON", () => {
    const r = parseClassifierResponse("not json at all");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failsafe).toBe(true);
      expect(r.error).toBe("invalid_json");
    }
  });

  it("failsafes when category is missing", () => {
    const r = parseClassifierResponse('{"reason": "missing field"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^schema_violation/);
  });

  it("failsafes when category is an unknown enum value", () => {
    const r = parseClassifierResponse(
      '{"category": "maybe", "reason": "unknown class"}',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^schema_violation/);
  });

  it("failsafes when category is the wrong type", () => {
    const r = parseClassifierResponse(
      '{"category": 1, "reason": "wrong type"}',
    );
    expect(r.ok).toBe(false);
  });

  it("failsafes when reason is empty", () => {
    const r = parseClassifierResponse(
      '{"category": "individual", "reason": ""}',
    );
    expect(r.ok).toBe(false);
  });

  it("failsafes when reason exceeds 500 chars", () => {
    const r = parseClassifierResponse(
      `{"category": "general", "reason": "${"x".repeat(501)}"}`,
    );
    expect(r.ok).toBe(false);
  });
});

describe("classifyIndividualLLM (orchestration)", () => {
  function geminiResult(text: string, tokensIn = 100, tokensOut = 30) {
    return {
      text,
      model: "gemini-2.5-flash",
      tokensIn,
      tokensOut,
      latencyMs: 800,
      finishReason: "STOP",
    };
  }

  it("forwards the message and a JSON-mode config to generate()", async () => {
    vi.mocked(generate).mockResolvedValueOnce(
      geminiResult('{"category": "general", "reason": "general"}'),
    );
    await classifyIndividualLLM("ビザの種類は？", "ja");
    expect(generate).toHaveBeenCalledWith(
      "ビザの種類は？",
      expect.objectContaining({
        responseMimeType: "application/json",
        temperature: 0,
        // thinkingBudget=256 (was 0) lets the classifier reason through
        // the (1) AND (2) gate instead of pattern-matching surface
        // words like 「困った」「相談」 to "individual". See
        // whitelist-llm.ts comment for the failure mode that drove
        // this knob change. maxOutputTokens bumped accordingly so
        // thinking + JSON output both fit under the combined cap.
        thinkingBudget: 256,
        maxOutputTokens: 1500,
      }),
    );
  });

  it("returns category=individual on a clean individual response", async () => {
    vi.mocked(generate).mockResolvedValueOnce(
      geminiResult('{"category": "individual", "reason": "personal visa"}'),
    );
    const r = await classifyIndividualLLM("My visa expires soon", "en");
    expect(r.category).toBe("individual");
    expect(r.failsafe).toBe(false);
    expect(r.reason).toBe("personal visa");
    expect(r.tokensIn).toBeGreaterThan(0);
  });

  it("returns category=general on a clean general response", async () => {
    vi.mocked(generate).mockResolvedValueOnce(
      geminiResult(
        '{"category": "general", "reason": "asks about general rule"}',
      ),
    );
    const r = await classifyIndividualLLM("How long is a working visa?", "en");
    expect(r.category).toBe("general");
    expect(r.failsafe).toBe(false);
  });

  it("returns category=smalltalk on a clean smalltalk response", async () => {
    vi.mocked(generate).mockResolvedValueOnce(
      geminiResult('{"category": "smalltalk", "reason": "greeting"}'),
    );
    const r = await classifyIndividualLLM("こんにちは", "ja");
    expect(r.category).toBe("smalltalk");
    expect(r.failsafe).toBe(false);
  });

  it("FAILSAFES (→ individual) when Gemini returns malformed JSON", async () => {
    vi.mocked(generate).mockResolvedValueOnce(geminiResult("not json"));
    const r = await classifyIndividualLLM("ambiguous", "en");
    expect(r.category).toBe("individual");
    expect(r.failsafe).toBe(true);
    expect(r.failsafeError).toBe("invalid_json");
  });

  it("FAILSAFES (→ individual) when Gemini returns valid JSON missing fields", async () => {
    vi.mocked(generate).mockResolvedValueOnce(
      geminiResult('{"reason": "lone field"}'),
    );
    const r = await classifyIndividualLLM("ambiguous", "en");
    expect(r.category).toBe("individual");
    expect(r.failsafe).toBe(true);
    expect(r.failsafeError).toMatch(/^schema_violation/);
  });

  it("FAILSAFES (→ individual) when category is an unknown enum value", async () => {
    vi.mocked(generate).mockResolvedValueOnce(
      geminiResult('{"category": "maybe", "reason": "unknown"}'),
    );
    const r = await classifyIndividualLLM("ambiguous", "en");
    expect(r.category).toBe("individual");
    expect(r.failsafe).toBe(true);
    expect(r.failsafeError).toMatch(/^schema_violation/);
  });

  it("FAILSAFES (→ individual) when generate() throws (timeout, 5xx, network)", async () => {
    vi.mocked(generate).mockRejectedValueOnce(
      new Error("upstream 503"),
    );
    const r = await classifyIndividualLLM("ambiguous", "en");
    expect(r.category).toBe("individual");
    expect(r.failsafe).toBe(true);
    expect(r.failsafeError).toMatch(/503/);
    expect(r.tokensIn).toBe(0); // no tokens billed because the call never landed
  });
});
