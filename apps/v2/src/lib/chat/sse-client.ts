// Client-side SSE consumer for /api/chat/send. Splits into a pure
// frame parser (parseSseFrames, unit-tested) and a streaming runner
// (consumeChatStream, used by the React chat surface in E-7).
//
// The server side is /api/chat/send/route.ts. Event shapes mirror
// what the server emits — keep them in sync.

import type { Citation } from "@/lib/ai/rag";

export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; period: string }
  | { type: "token"; text: string }
  | {
      type: "done";
      kind: "answer";
      text: string;
      disclaimer: string;
      citations: Citation[];
      meta: {
        model: string;
        tokensIn: number;
        tokensOut: number;
        latencyMs: number;
        finishReason: string | null;
        piiMasked: boolean;
        ragEmbedMs: number;
        ragMatchMs: number;
        ragFailed: boolean;
      };
      userMessageId?: string;
      replyMessageId?: string;
    }
  | {
      type: "done";
      kind: "escalate";
      reason: string;
      text: string;
      userMessageId?: string;
      replyMessageId?: string;
    }
  | {
      type: "done";
      kind: "blocked";
      reason: string;
      text: string;
      piiTypes: string[];
    }
  | { type: "done"; kind: "error"; code: string };

/**
 * Pure frame parser. Takes the current buffer, returns any complete
 * SSE events found plus the unparsed remainder. Handles partial
 * frames at the end of the buffer.
 */
export function parseSseFrames(buffer: string): {
  events: unknown[];
  remainder: string;
} {
  const events: unknown[] = [];
  let remainder = buffer;
  while (true) {
    const idx = remainder.indexOf("\n\n");
    if (idx === -1) break;
    const frame = remainder.slice(0, idx);
    remainder = remainder.slice(idx + 2);
    // SSE may contain multiple field lines per frame, but our server
    // only emits a single `data:` line. Be tolerant.
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        events.push(JSON.parse(payload));
      } catch {
        // ignore malformed frame; server invariant says JSON
      }
    }
  }
  return { events, remainder };
}

export interface ChatStreamCallbacks {
  onEvent: (event: ChatStreamEvent) => void;
  /** Pre-stream HTTP error (401 / 400 / 429 / 404 / 403 / 500). */
  onHttpError?: (status: number, payload: unknown) => void;
  signal?: AbortSignal;
}

/**
 * Drive a POST /api/chat/send request, parsing SSE frames as they
 * arrive and forwarding each event through onEvent. Resolves when
 * the stream closes naturally, rejects on network errors.
 *
 * Pre-stream guards (401 / 400 / 429 / 404 / 403) return a normal
 * JSON body, not SSE; onHttpError fires for those.
 */
export async function consumeChatStream(
  body: { message: string; locale: "ja" | "en" | "tl"; conversationId?: string },
  cb: ChatStreamCallbacks,
): Promise<void> {
  const res = await fetch("/api/chat/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: cb.signal,
  });

  if (!res.ok || !res.body) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    cb.onHttpError?.(res.status, payload);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = parseSseFrames(buffer);
    buffer = remainder;
    for (const e of events) {
      cb.onEvent(e as ChatStreamEvent);
    }
  }
}
