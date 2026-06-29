import { getAdminClient } from "@/lib/supabase/admin";
import { embed } from "./embedding";
import { chunkArticle, chunkFaq, type Chunk } from "./chunking";

// Re-indexing pipeline for W5 RAG. Two entry points:
//
//   - reindexArticle(id) / reindexFaq(id): called after an admin
//     mutation so a single row's embeddings stay current
//   - reindexAll(): manual full rebuild (script or admin "rebuild all"
//     button); used at first launch and after the rare case where
//     individual hooks were skipped (e.g. SQL backfill)
//
// Idempotency model: DELETE FROM content_embeddings WHERE source_id =
// <id> THEN INSERT. No UPSERT because the column set has no unique
// constraint on (source_type, source_id, chunk_index). The DELETE is
// safe because the route handler / script is the only writer to this
// table (RLS has no policies, so the service-role admin client owns
// it end to end).
//
// Pacing: embedContent in serial with no artificial sleep — the
// Gemini Free-tier embedding RPM was found to be high enough at W5
// E-1 to sustain a 60-call reindex back-to-back. If a future quota
// tightening surfaces 429s here, gate behind a queue.

type Locale = "ja" | "en" | "tl";

interface ReindexCounts {
  source_id: string;
  source_type: "article" | "faq";
  chunks_inserted: number;
  embed_calls: number;
}

// Pure locale-selection helpers (unit-tested in reindex-locales.test.ts).
// A locale is embeddable only when its content is actually translated; ja is
// always present, en / tl are nullable. Embedding an untranslated locale would
// pollute that locale's RAG with Japanese (or empty) snippets.

export interface ArticleLocaleInput {
  language: Locale;
  title: string;
  body: string;
}

export function articleLocaleInputs(row: {
  title_ja: string;
  title_en: string | null;
  title_tl: string | null;
  body_ja: string;
  body_en: string | null;
  body_tl: string | null;
}): ArticleLocaleInput[] {
  return [
    { language: "ja" as const, title: row.title_ja, body: row.body_ja },
    { language: "en" as const, title: row.title_en ?? "", body: row.body_en ?? "" },
    { language: "tl" as const, title: row.title_tl ?? "", body: row.body_tl ?? "" },
  ].filter((l) => l.body.trim().length > 0);
}

export interface FaqLocaleInput {
  language: Locale;
  question: string;
  answer: string;
}

export function faqLocaleInputs(row: {
  question_ja: string;
  question_en: string | null;
  question_tl: string | null;
  answer_ja: string;
  answer_en: string | null;
  answer_tl: string | null;
}): FaqLocaleInput[] {
  return [
    { language: "ja" as const, question: row.question_ja, answer: row.answer_ja },
    {
      language: "en" as const,
      question: row.question_en ?? "",
      answer: row.answer_en ?? "",
    },
    {
      language: "tl" as const,
      question: row.question_tl ?? "",
      answer: row.answer_tl ?? "",
    },
  ].filter((l) => l.question.trim().length > 0 && l.answer.trim().length > 0);
}

async function embedChunks(
  chunks: Chunk[],
  language: Locale,
  source_type: "article" | "faq",
  source_id: string,
): Promise<{ rows: Array<Record<string, unknown>>; embed_calls: number }> {
  const rows: Array<Record<string, unknown>> = [];
  let embed_calls = 0;
  for (const c of chunks) {
    const r = await embed(c.text, {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768,
    });
    embed_calls += 1;
    rows.push({
      source_type,
      source_id,
      language,
      chunk_text: c.text,
      chunk_index: c.index,
      // Supabase / pgvector accepts a JSON array literal in the form
      // "[0.1, 0.2, ...]" or the numeric array directly. The JS client
      // sends arrays as JSON so the numeric form works.
      embedding: r.vector,
    });
  }
  return { rows, embed_calls };
}

async function replaceEmbeddings(
  source_type: "article" | "faq",
  source_id: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const admin = getAdminClient();
  // DELETE first so the row count for this source is exactly what we
  // about to insert. Not transactional with the INSERT (Supabase
  // client doesn't expose a tx wrapper), but in practice the window
  // between DELETE and INSERT is sub-second and no other writer
  // exists for this table.
  const del = await admin
    .from("content_embeddings")
    .delete()
    .eq("source_type", source_type)
    .eq("source_id", source_id);
  if (del.error) throw new Error(`reindex DELETE failed: ${del.error.message}`);

  if (rows.length === 0) return;
  // Cast: content_embeddings isn't in the typed Database yet (W5
  // surface migration 004 may add it); the runtime contract is
  // exactly the columns we send.
  const ins = await admin
    .from("content_embeddings" as never)
    .insert(rows as never);
  if (ins.error) throw new Error(`reindex INSERT failed: ${ins.error.message}`);
}

/**
 * Re-embed a single article across every translated locale. ja is always
 * present (NOT NULL); en / tl are embedded only when their body is non-empty,
 * so untranslated articles simply don't surface in those locales' RAG rather
 * than falling back to a Japanese snippet. All locales are written under one
 * DELETE+INSERT so the row set for this source is always internally consistent.
 *
 * Drafts and archived rows have their old embeddings removed but none
 * inserted — they must not surface in RAG.
 */
export async function reindexArticle(articleId: string): Promise<ReindexCounts> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select(
      "id, title_ja, title_en, title_tl, body_ja, body_en, body_tl, status",
    )
    .eq("id", articleId)
    .maybeSingle();
  if (error) throw new Error(`reindex article fetch failed: ${error.message}`);
  if (!data) throw new Error(`article ${articleId} not found`);

  const rows: Array<Record<string, unknown>> = [];
  let embed_calls = 0;
  if (data.status === "published") {
    for (const loc of articleLocaleInputs(data)) {
      const chunks = chunkArticle(loc.body, loc.title);
      const res = await embedChunks(chunks, loc.language, "article", articleId);
      rows.push(...res.rows);
      embed_calls += res.embed_calls;
    }
  }
  await replaceEmbeddings("article", articleId, rows);

  return {
    source_id: articleId,
    source_type: "article",
    chunks_inserted: rows.length,
    embed_calls,
  };
}

/**
 * Re-embed a single FAQ across every translated locale. A locale is embedded
 * only when BOTH its question and answer are present (en / tl are nullable);
 * ja is always present. Unpublished FAQs have all embeddings removed.
 */
export async function reindexFaq(faqId: string): Promise<ReindexCounts> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .select(
      "id, question_ja, question_en, question_tl, answer_ja, answer_en, answer_tl, is_published",
    )
    .eq("id", faqId)
    .maybeSingle();
  if (error) throw new Error(`reindex faq fetch failed: ${error.message}`);
  if (!data) throw new Error(`faq ${faqId} not found`);

  const rows: Array<Record<string, unknown>> = [];
  let embed_calls = 0;
  if (data.is_published) {
    for (const loc of faqLocaleInputs(data)) {
      const chunks = chunkFaq(loc.question, loc.answer);
      const res = await embedChunks(chunks, loc.language, "faq", faqId);
      rows.push(...res.rows);
      embed_calls += res.embed_calls;
    }
  }
  await replaceEmbeddings("faq", faqId, rows);

  return {
    source_id: faqId,
    source_type: "faq",
    chunks_inserted: rows.length,
    embed_calls,
  };
}

/**
 * Remove all embeddings for a source. Used by admin DELETE handlers, since
 * content_embeddings has no FK to articles / faqs and so does not cascade.
 */
export async function removeEmbeddings(
  source_type: "article" | "faq",
  source_id: string,
): Promise<void> {
  await replaceEmbeddings(source_type, source_id, []);
}

// Non-fatal wrappers for admin route handlers. A reindex failure must NOT
// fail the mutation the editor already committed — the row is saved and a
// manual `pnpm reindex` can recover the embeddings. These log and swallow.
// Awaited (not fire-and-forget) so the write completes on serverless before
// the function freezes, matching the auto-title pattern in the chat route.

export async function reindexArticleSafe(articleId: string): Promise<void> {
  try {
    const r = await reindexArticle(articleId);
    console.log(
      `[reindex] article ${articleId}: ${r.chunks_inserted} chunks, ${r.embed_calls} embed calls`,
    );
  } catch (err) {
    console.error(
      `[reindex] article ${articleId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function reindexFaqSafe(faqId: string): Promise<void> {
  try {
    const r = await reindexFaq(faqId);
    console.log(
      `[reindex] faq ${faqId}: ${r.chunks_inserted} chunks, ${r.embed_calls} embed calls`,
    );
  } catch (err) {
    console.error(
      `[reindex] faq ${faqId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function removeEmbeddingsSafe(
  source_type: "article" | "faq",
  source_id: string,
): Promise<void> {
  try {
    await removeEmbeddings(source_type, source_id);
  } catch (err) {
    console.error(
      `[reindex] remove ${source_type} ${source_id} embeddings failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Full rebuild. Iterates all published articles and is_published
 * FAQs, re-indexing each in turn. Yields a per-row report.
 */
export async function* reindexAll(): AsyncGenerator<ReindexCounts> {
  const admin = getAdminClient();

  const articles = await admin
    .from("articles")
    .select("id")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (articles.error)
    throw new Error(`reindexAll articles fetch: ${articles.error.message}`);

  for (const row of articles.data ?? []) {
    yield await reindexArticle(row.id);
  }

  const faqs = await admin
    .from("faqs")
    .select("id")
    .eq("is_published", true)
    .order("created_at", { ascending: true });
  if (faqs.error) throw new Error(`reindexAll faqs fetch: ${faqs.error.message}`);

  for (const row of faqs.data ?? []) {
    yield await reindexFaq(row.id);
  }
}
