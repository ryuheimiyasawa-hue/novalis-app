// Chunking primitives for W5 RAG indexing. Pure functions — no I/O,
// no SDK calls — so the rules are easy to unit test and the same
// chunker can run from the admin write hook, the manual reindex
// script, or a future cron.
//
// Targets follow the W5 design (§4-3):
//   - articles: ~500 chars per chunk, ~100 char overlap when a single
//     paragraph exceeds maxParagraphChars (we'd rather not split most
//     paragraphs at all)
//   - faqs: Q + A as a single chunk, no splitting — splitting only
//     the question or only the answer loses retrieval signal

export interface Chunk {
  /** Text actually sent to the embedding endpoint. */
  text: string;
  /** Position within the source document, 0-based. */
  index: number;
}

export interface ChunkArticleOptions {
  /** Target chunk size in characters. Default 500. */
  targetChars?: number;
  /** Single-paragraph upper bound. Paragraphs longer than this are
   *  split by sentence with overlap. Default 800. */
  maxParagraphChars?: number;
  /** Overlap (chars) carried over from one chunk to the next when a
   *  paragraph has to be split. Default 100. */
  overlapChars?: number;
}

const SENTENCE_BOUNDARY = /(?<=[。．！？!?])\s*/;

/**
 * Split an article body into retrieval-friendly chunks. Each chunk is
 * prefixed with [title]\n so the embedding has the topic in context
 * even when the chunk's content is a follow-up paragraph.
 */
export function chunkArticle(
  body: string,
  title: string,
  opts: ChunkArticleOptions = {},
): Chunk[] {
  const target = opts.targetChars ?? 500;
  const maxPara = opts.maxParagraphChars ?? 800;
  const overlap = opts.overlapChars ?? 100;

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const rawChunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    if (para.length > maxPara) {
      // Oversized paragraph: split by sentences with overlap.
      if (buffer) {
        rawChunks.push(buffer);
        buffer = "";
      }
      for (const split of splitWithOverlap(para, target, overlap)) {
        rawChunks.push(split);
      }
    } else if (buffer.length === 0) {
      buffer = para;
    } else if (buffer.length + 2 + para.length <= target * 1.5) {
      // Append small paragraphs together until the buffer is around target size.
      buffer = `${buffer}\n\n${para}`;
    } else {
      rawChunks.push(buffer);
      buffer = para;
    }
  }
  if (buffer) rawChunks.push(buffer);

  // Prefix each chunk with the title so retrieval has topic context.
  return rawChunks.map((text, index) => ({
    text: `[${title}]\n${text}`,
    index,
  }));
}

/**
 * Split a single oversized paragraph by sentence boundaries with
 * carry-over overlap. Each non-first chunk begins with the last
 * sentence(s) from the previous chunk so cross-boundary semantics
 * are preserved.
 */
function splitWithOverlap(
  text: string,
  target: number,
  overlap: number,
): string[] {
  const sentences = text.split(SENTENCE_BOUNDARY).filter(Boolean);
  if (sentences.length === 0) return [text];

  const chunks: string[] = [];
  let current = "";
  let currentSentences: string[] = [];

  for (const sent of sentences) {
    const candidate = current ? current + sent : sent;
    if (candidate.length > target && current) {
      chunks.push(current);
      // Build the carry-over from the tail of the previous chunk.
      let carry = "";
      const carryParts: string[] = [];
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const next = currentSentences[i] + carry;
        if (next.length > overlap && carryParts.length > 0) break;
        carry = next;
        carryParts.unshift(currentSentences[i]);
      }
      current = carry + sent;
      currentSentences = [...carryParts, sent];
    } else {
      current = candidate;
      currentSentences.push(sent);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * FAQ chunker: emit a single Q + A chunk. We don't split because
 * each side independently misleads retrieval (a bare question lacks
 * the answer signal; a bare answer lacks the topic signal).
 */
export function chunkFaq(question: string, answer: string): Chunk[] {
  return [
    {
      text: `Q: ${question.trim()}\nA: ${answer.trim()}`,
      index: 0,
    },
  ];
}
