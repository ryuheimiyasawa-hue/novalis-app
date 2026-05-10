import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";

// Thin wrapper around @google/genai used by the W4 chat pipeline.
// Responsibilities:
//   - lazy singleton client (one socket pool per process)
//   - timeout via AbortController
//   - exponential backoff retry on 429 / 5xx
//   - structured logging of token usage and latency
//   - normalised return shape so the caller never touches SDK types
//
// The wrapper deliberately does NOT do prompt construction or
// classification — those live in chat-pipeline.ts and whitelist-llm.ts
// so this file stays a transport concern only.

let cached: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

// Test seam: tests can clear the cached client between runs without
// having to reach into module internals.
export function _resetGeminiClient(): void {
  cached = null;
}

export interface GenerateOptions {
  /** Override the configured model (default: GEMINI_MODEL env / gemini-2.5-flash). */
  model?: string;
  /** System instruction prepended by the SDK (does not count toward user input length). */
  systemInstruction?: string;
  /** 0.0-1.0. Use 0 for classifiers, 0.7-ish for creative answers. */
  temperature?: number;
  /** When set to "application/json" plus a schema, Gemini returns valid JSON. */
  responseMimeType?: "application/json" | "text/plain";
  /** JSON schema enforced by Gemini when responseMimeType is JSON. */
  responseSchema?: object;
  /** Hard ceiling on output tokens; protects against runaway generations. */
  maxOutputTokens?: number;
  /** Hard timeout per attempt in ms (default: GEMINI_TIMEOUT_MS env / 30000). */
  timeoutMs?: number;
  /** Max attempts including the first (default 3). 1 disables retry. */
  maxAttempts?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  /** "STOP" on success, "SAFETY" / "MAX_TOKENS" / etc. when truncated. */
  finishReason: string | null;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return false; // caller hit timeout
    // SDK errors carry the HTTP status either on .status or in the message
    const maybeStatus = (err as { status?: number }).status;
    if (typeof maybeStatus === "number" && RETRYABLE_STATUS.has(maybeStatus)) return true;
    if (/\b(429|500|502|503|504)\b/.test(err.message)) return true;
    if (/network|timeout|fetch failed/i.test(err.message)) return true;
  }
  return false;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`gemini call timed out after ${ms}ms`);
      err.name = "AbortError";
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function backoffDelayMs(attemptIndex: number): number {
  // 0 -> 500ms, 1 -> 1500ms, 2 -> 4500ms, capped at 10s.
  return Math.min(500 * 3 ** attemptIndex, 10_000);
}

export async function generate(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const client = getClient();
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const timeoutMs =
    opts.timeoutMs ?? (Number(process.env.GEMINI_TIMEOUT_MS) || 30_000);
  const maxAttempts = opts.maxAttempts ?? 3;

  const config: GenerateContentConfig = {};
  if (opts.systemInstruction) config.systemInstruction = opts.systemInstruction;
  if (opts.temperature !== undefined) config.temperature = opts.temperature;
  if (opts.responseMimeType) config.responseMimeType = opts.responseMimeType;
  if (opts.responseSchema)
    // Cast: SDK expects Schema | undefined; we accept plain JSON Schema and trust the caller.
    config.responseSchema = opts.responseSchema as GenerateContentConfig["responseSchema"];
  if (opts.maxOutputTokens !== undefined)
    config.maxOutputTokens = opts.maxOutputTokens;

  const start = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await withTimeout(
        client.models.generateContent({ model, contents: prompt, config }),
        timeoutMs,
      );
      const latencyMs = Date.now() - start;
      const tokensIn = response.usageMetadata?.promptTokenCount ?? 0;
      const tokensOut = response.usageMetadata?.candidatesTokenCount ?? 0;
      const text = response.text ?? "";
      const finishReason = response.candidates?.[0]?.finishReason ?? null;

      console.log(
        `[gemini] ok model=${model} tokens=${tokensIn}/${tokensOut} latency=${latencyMs}ms finish=${finishReason} attempt=${attempt + 1}`,
      );
      return { text, model, tokensIn, tokensOut, latencyMs, finishReason };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[gemini] attempt ${attempt + 1}/${maxAttempts} failed model=${model} err=${message}`,
      );
      if (attempt + 1 >= maxAttempts || !isRetryable(err)) break;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
    }
  }

  const latencyMs = Date.now() - start;
  console.error(
    `[gemini] giving up model=${model} latency=${latencyMs}ms err=${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
  throw lastError instanceof Error
    ? lastError
    : new Error(`gemini call failed: ${String(lastError)}`);
}
