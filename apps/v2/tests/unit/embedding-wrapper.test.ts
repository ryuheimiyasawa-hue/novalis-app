import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const embedContentSpy = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { embedContent: embedContentSpy };
  },
}));

process.env.GEMINI_API_KEY = "test-key";

import { _resetEmbeddingClient, embed } from "@/lib/ai/embedding";

beforeEach(() => {
  vi.resetAllMocks();
  _resetEmbeddingClient();
});

afterEach(() => {
  vi.useRealTimers();
});

function vector(dim: number): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(i) * 0.01);
}

function okResponse(dim = 768) {
  return { embeddings: [{ values: vector(dim) }] };
}

describe("embed()", () => {
  it("returns the vector + dim + model on the happy path", async () => {
    embedContentSpy.mockResolvedValueOnce(okResponse(768));
    const r = await embed("ビザ更新の手続きは？");
    expect(r.dim).toBe(768);
    expect(r.vector).toHaveLength(768);
    expect(r.model).toBe("gemini-embedding-001");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(embedContentSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards outputDimensionality and taskType to the SDK config", async () => {
    embedContentSpy.mockResolvedValueOnce(okResponse(512));
    await embed("renewing a working visa in Japan", {
      outputDimensionality: 512,
      taskType: "RETRIEVAL_QUERY",
    });
    expect(embedContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-embedding-001",
        contents: "renewing a working visa in Japan",
        config: expect.objectContaining({
          outputDimensionality: 512,
          taskType: "RETRIEVAL_QUERY",
        }),
      }),
    );
  });

  it("honours the model override", async () => {
    embedContentSpy.mockResolvedValueOnce(okResponse(768));
    await embed("hi", { model: "future-model-name" });
    expect(embedContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model: "future-model-name" }),
    );
  });

  it("rejects empty input without calling the SDK", async () => {
    await expect(embed("")).rejects.toThrow(/non-empty/);
    await expect(embed("   ")).rejects.toThrow(/non-empty/);
    expect(embedContentSpy).not.toHaveBeenCalled();
  });

  it("throws cleanly when GEMINI_API_KEY is missing", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    _resetEmbeddingClient();
    await expect(embed("hi")).rejects.toThrow(/GEMINI_API_KEY/);
    process.env.GEMINI_API_KEY = original;
  });

  it("retries on 5xx and succeeds on the second attempt", async () => {
    const fail = Object.assign(new Error("upstream 503"), { status: 503 });
    embedContentSpy
      .mockRejectedValueOnce(fail)
      .mockResolvedValueOnce(okResponse(768));
    const r = await embed("hi");
    expect(r.dim).toBe(768);
    expect(embedContentSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 429 (Lesson 15 — quota delays exceed our backoff)", async () => {
    const fail = Object.assign(
      new Error("Resource exhausted: 429"),
      { status: 429 },
    );
    embedContentSpy.mockRejectedValueOnce(fail);
    await expect(embed("hi", { maxAttempts: 3 })).rejects.toThrow(/429/);
    expect(embedContentSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 4xx other than 429-equivalents", async () => {
    const fail = Object.assign(new Error("invalid argument: 400"), {
      status: 400,
    });
    embedContentSpy.mockRejectedValueOnce(fail);
    await expect(embed("hi", { maxAttempts: 3 })).rejects.toThrow(/invalid/);
    expect(embedContentSpy).toHaveBeenCalledTimes(1);
  });

  it("times out when the SDK never resolves", async () => {
    embedContentSpy.mockImplementation(() => new Promise(() => {}));
    await expect(embed("hi", { timeoutMs: 30, maxAttempts: 1 })).rejects.toThrow(
      /timed out/,
    );
  });

  it("throws when the SDK returns no embedding (empty array)", async () => {
    embedContentSpy.mockResolvedValueOnce({ embeddings: [] });
    await expect(embed("hi")).rejects.toThrow(/empty embedding/);
  });

  it("throws when the SDK returns a malformed payload", async () => {
    embedContentSpy.mockResolvedValueOnce({});
    await expect(embed("hi")).rejects.toThrow(/empty embedding/);
  });
});
