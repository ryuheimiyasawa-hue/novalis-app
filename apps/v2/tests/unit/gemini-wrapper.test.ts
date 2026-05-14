import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock the SDK before importing the wrapper so the singleton inside
// gemini.ts grabs our spy instead of the real client.
const generateContentSpy = vi.fn();
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = { generateContent: generateContentSpy };
    },
  };
});

// Ensure GEMINI_API_KEY is set so getClient() doesn't throw at import time
// (it's read inside generate(), not at module load — but safer to set).
process.env.GEMINI_API_KEY = "test-key";

import { _resetGeminiClient, generate } from "@/lib/ai/gemini";

beforeEach(() => {
  vi.resetAllMocks();
  _resetGeminiClient();
});

afterEach(() => {
  vi.useRealTimers();
});

function ok(text: string, tokensIn = 5, tokensOut = 7) {
  return {
    text,
    candidates: [{ finishReason: "STOP" }],
    usageMetadata: {
      promptTokenCount: tokensIn,
      candidatesTokenCount: tokensOut,
    },
  };
}

describe("generate()", () => {
  it("returns a normalised result on the happy path", async () => {
    generateContentSpy.mockResolvedValueOnce(ok("hi", 3, 4));
    const r = await generate("hello", { model: "gemini-2.5-flash" });
    expect(r.text).toBe("hi");
    expect(r.model).toBe("gemini-2.5-flash");
    expect(r.tokensIn).toBe(3);
    expect(r.tokensOut).toBe(4);
    expect(r.finishReason).toBe("STOP");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to GEMINI_MODEL env when model option is omitted", async () => {
    process.env.GEMINI_MODEL = "gemini-test-from-env";
    generateContentSpy.mockResolvedValueOnce(ok(""));
    const r = await generate("hello");
    expect(r.model).toBe("gemini-test-from-env");
    expect(generateContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-test-from-env" }),
    );
    delete process.env.GEMINI_MODEL;
  });

  it("does NOT retry on 429 — Gemini quota delays exceed our backoff window", async () => {
    // Discovered in W4 D-4 live probe: Gemini's retryDelay for 429 is
    // tens of seconds, so retrying with our 500ms / 1500ms backoff is
    // wasted effort. The chat pipeline fail-safes (escalates) instead.
    const fail = Object.assign(new Error("Resource exhausted: 429"), {
      status: 429,
    });
    generateContentSpy.mockRejectedValueOnce(fail);
    await expect(generate("hello", { maxAttempts: 3 })).rejects.toThrow(/429/);
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
  });

  it("still retries on transient 5xx and succeeds on the second attempt", async () => {
    const fail = Object.assign(new Error("upstream 503"), { status: 503 });
    generateContentSpy
      .mockRejectedValueOnce(fail)
      .mockResolvedValueOnce(ok("recovered"));
    const r = await generate("hello", { maxAttempts: 3 });
    expect(r.text).toBe("recovered");
    expect(generateContentSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on non-retryable errors", async () => {
    // 400 should be surfaced immediately — there is no point in burning
    // attempts on a bad request.
    const fail = Object.assign(new Error("invalid argument: 400"), {
      status: 400,
    });
    generateContentSpy.mockRejectedValueOnce(fail);
    await expect(generate("hello", { maxAttempts: 3 })).rejects.toThrow(
      /invalid argument/,
    );
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and rethrows the last error", async () => {
    const fail = Object.assign(new Error("Bad Gateway 502"), { status: 502 });
    generateContentSpy.mockRejectedValue(fail);
    await expect(generate("hello", { maxAttempts: 2 })).rejects.toThrow(
      /502/,
    );
    expect(generateContentSpy).toHaveBeenCalledTimes(2);
  });

  it("throws AbortError-style when the call exceeds timeoutMs", async () => {
    // Pending promise that never resolves.
    generateContentSpy.mockImplementation(
      () => new Promise(() => {}),
    );
    await expect(
      generate("hello", { timeoutMs: 50, maxAttempts: 1 }),
    ).rejects.toThrow(/timed out/);
  });

  it("does NOT retry after a timeout (timeouts indicate the caller's deadline)", async () => {
    generateContentSpy.mockImplementation(() => new Promise(() => {}));
    await expect(
      generate("hello", { timeoutMs: 30, maxAttempts: 3 }),
    ).rejects.toThrow(/timed out/);
    // Only one attempt because AbortError is non-retryable.
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards JSON-mode config to the SDK", async () => {
    generateContentSpy.mockResolvedValueOnce(
      ok('{"category": "individual", "reason": "ok"}'),
    );
    await generate("classify me", {
      responseMimeType: "application/json",
      responseSchema: { type: "object" },
      temperature: 0,
    });
    expect(generateContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: "application/json",
          temperature: 0,
        }),
      }),
    );
  });

  it("throws cleanly when GEMINI_API_KEY is missing", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    _resetGeminiClient();
    await expect(generate("hello")).rejects.toThrow(/GEMINI_API_KEY/);
    process.env.GEMINI_API_KEY = original;
  });
});
