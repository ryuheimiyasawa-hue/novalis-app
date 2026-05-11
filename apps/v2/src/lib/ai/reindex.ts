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
 * Re-embed a single article (ja body only for MVP; en/tl follow when
 * the seed content is translated). Returns the count of chunks
 * inserted.
 */
export async function reindexArticle(articleId: string): Promise<ReindexCounts> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select("id, title_ja, body_ja, status")
    .eq("id", articleId)
    .maybeSingle();
  if (error) throw new Error(`reindex article fetch failed: ${error.message}`);
  if (!data) throw new Error(`article ${articleId} not found`);

  // Drafts and archived rows have their old embeddings removed but no
  // new ones inserted — they shouldn't surface in RAG.
  const chunks =
    data.status === "published"
      ? chunkArticle(data.body_ja, data.title_ja)
      : [];
  const { rows, embed_calls } = await embedChunks(
    chunks,
    "ja",
    "article",
    articleId,
  );
  await replaceEmbeddings("article", articleId, rows);

  return {
    source_id: articleId,
    source_type: "article",
    chunks_inserted: rows.length,
    embed_calls,
  };
}

/**
 * Re-embed a single FAQ. Unpublished FAQs have their embeddings
 * removed.
 */
export async function reindexFaq(faqId: string): Promise<ReindexCounts> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .select("id, question_ja, answer_ja, is_published")
    .eq("id", faqId)
    .maybeSingle();
  if (error) throw new Error(`reindex faq fetch failed: ${error.message}`);
  if (!data) throw new Error(`faq ${faqId} not found`);

  const chunks = data.is_published
    ? chunkFaq(data.question_ja, data.answer_ja)
    : [];
  const { rows, embed_calls } = await embedChunks(chunks, "ja", "faq", faqId);
  await replaceEmbeddings("faq", faqId, rows);

  return {
    source_id: faqId,
    source_type: "faq",
    chunks_inserted: rows.length,
    embed_calls,
  };
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
