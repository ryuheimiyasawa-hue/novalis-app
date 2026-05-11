import { GoogleGenAI } from "@google/genai";

// Embedding wrapper for the W5 RAG pipeline. Mirrors lib/ai/gemini.ts's
// concerns (timeout, retry policy, structured logging) but for the
// `embedContent` endpoint instead of `generateContent`.
//
// Model: gemini-embedding-001 (current Gemini stable embedding model).
// text-embedding-004 — the model the W5 design originally listed —
// was deprecated 2026-01-14 (see Lesson 16); 001 is its replacement.
//
// Dimensions: 768 via MRL (Matryoshka Representation Learning). The
// model's native output is 3072 floats; we ask for 768 because:
//   - existing migration 001 already has content_embeddings.embedding
//     VECTOR(768) so no ALTER is needed
//   - HNSW indexes are markedly faster at 768 than 3072
//   - MTEB difference vs 3072 is 2-3 pts, not material at MVP scale
//
// Task type: pass RETRIEVAL_DOCUMENT when indexing articles / FAQs and
// RETRIEVAL_QUERY when embedding a user message. Asymmetric task hints
// let the model learn distinct vector geometries for the two sides.
// Skip for development / smoke and the model defaults to a general
// similarity task.

let cached: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export function _resetEmbeddingClient(): void {
  cached = null;
}

export type EmbeddingTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING";

export interface EmbedOptions {
  /** Override the configured model (default: gemini-embedding-001). */
  model?: string;
  /** Target dimensionality via MRL (default: 768). */
  outputDimensionality?: number;
  /** Asymmetric task hint — see file header. */
  taskType?: EmbeddingTaskType;
  /** Optional title (only honoured with taskType=RETRIEVAL_DOCUMENT). */
  title?: string;
  /** Hard per-attempt timeout in ms (default 30000). */
  timeoutMs?: number;
  /** Max attempts including the first (default 3). */
  maxAttempts?: number;
}

export interface EmbedResult {
  vector: number[];
  /** Length of `vector`, redundant but lets callers assert. */
  dim: number;
  model: string;
  /** Time from request start to success (includes any retry waits). */
  latencyMs: number;
}

const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return false;
    const maybeStatus = (err as { status?: number }).status;
    if (typeof maybeStatus === "number") {
      if (maybeStatus === 429) return false; // Lesson 15 — quota delays exceed our backoff
      if (RETRYABLE_STATUS.has(maybeStatus)) return true;
    }
    if (/(?:^|[^\d])429(?:[^\d]|$)/.test(err.message)) return false;
    if (/(?:^|[^\d])(500|502|503|504|408)(?:[^\d]|$)/.test(err.message)) return true;
    if (/network|timeout|fetch failed/i.test(err.message)) return true;
  }
  return false;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`embedding call timed out after ${ms}ms`);
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
  return Math.min(500 * 3 ** attemptIndex, 10_000);
}

export async function embed(
  text: string,
  opts: EmbedOptions = {},
): Promise<EmbedResult> {
  if (!text || !text.trim()) {
    throw new Error("embed() requires a non-empty input string");
  }
  const client = getClient();
  const model = opts.model ?? "gemini-embedding-001";
  const outputDimensionality = opts.outputDimensionality ?? 768;
  const timeoutMs =
    opts.timeoutMs ?? (Number(process.env.GEMINI_TIMEOUT_MS) || 30_000);
  const maxAttempts = opts.maxAttempts ?? 3;

  // SDK config type is broader than what we send; cast keeps TS happy
  // without pulling in the full surface area.
  const config: Record<string, unknown> = { outputDimensionality };
  if (opts.taskType) config.taskType = opts.taskType;
  if (opts.title) config.title = opts.title;

  const start = Date.now();
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await withTimeout(
        client.models.embedContent({
          model,
          contents: text,
          config: config as Parameters<typeof client.models.embedContent>[0]["config"],
        }),
        timeoutMs,
      );
      const vector = response.embeddings?.[0]?.values ?? [];
      if (vector.length === 0) {
        throw new Error("embedContent returned empty embedding");
      }
      const latencyMs = Date.now() - start;
      console.log(
        `[embed] ok model=${model} dim=${vector.length} latency=${latencyMs}ms attempt=${attempt + 1}`,
      );
      return { vector, dim: vector.length, model, latencyMs };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[embed] attempt ${attempt + 1}/${maxAttempts} failed model=${model} err=${message}`,
      );
      if (attempt + 1 >= maxAttempts || !isRetryable(err)) break;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
    }
  }

  const latencyMs = Date.now() - start;
  console.error(
    `[embed] giving up model=${model} latency=${latencyMs}ms err=${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
  throw lastError instanceof Error
    ? lastError
    : new Error(`embedding call failed: ${String(lastError)}`);
}
