import { getAdminClient } from "@/lib/supabase/admin";
import { embed } from "./embedding";

// W5 RAG retrieval. Composes the W5 E-1 embedding wrapper with the
// migration-004 match_content RPC, then joins the source rows
// (articles / faqs) to produce citation metadata the chat UI can
// render inline.
//
// The RPC returns up to N chunks ranked by cosine similarity with a
// same-language tie-break. We don't apply further re-ranking on the
// JS side at MVP — the SQL ordering is already enough.

export type Locale = "ja" | "en" | "tl";

export interface RagChunkRow {
  source_type: "article" | "faq";
  source_id: string;
  language: string;
  chunk_text: string;
  similarity: number;
}

export interface Citation {
  source_type: "article" | "faq";
  source_id: string;
  language: string;
  similarity: number;
  /** Articles only — link target for inline `[#N]` clicks. */
  slug: string | null;
  /** Article title or FAQ question (resolved in the caller's locale). */
  title: string;
  /** First 150 chars of the chunk for hover/tap preview. */
  snippet: string;
}

export interface RagResult {
  /** Formatted REFERENCE block to inject into the LLM system prompt. */
  contextText: string;
  citations: Citation[];
  /** Diagnostic latency breakdown for structured logging. */
  embedLatencyMs: number;
  matchLatencyMs: number;
  joinLatencyMs: number;
}

/** Cap snippet length so logs and UI hovercards stay manageable. */
const SNIPPET_LEN = 150;

/** Strip the title prefix `[Title]\n` that chunkArticle adds, so snippets don't leak it. */
function stripTitlePrefix(chunkText: string): string {
  const m = chunkText.match(/^\[[^\]]+\]\n/);
  if (m) return chunkText.slice(m[0].length);
  return chunkText;
}

function makeSnippet(chunkText: string): string {
  const stripped = stripTitlePrefix(chunkText).replace(/\s+/g, " ").trim();
  if (stripped.length <= SNIPPET_LEN) return stripped;
  return stripped.slice(0, SNIPPET_LEN - 1) + "…";
}

/** Pure: build the system-prompt-ready context block from joined citations. */
export function buildContextText(citations: Citation[]): string {
  if (citations.length === 0) return "";
  const lines: string[] = ["REFERENCE_BEGIN"];
  citations.forEach((c, i) => {
    const idx = i + 1;
    const slugAttr = c.slug ? ` slug=${c.slug}` : "";
    lines.push(`[#${idx} src=${c.source_type}${slugAttr} lang=${c.language}]`);
    lines.push(c.snippet);
  });
  lines.push("REFERENCE_END");
  return lines.join("\n");
}

interface JoinResult {
  /** keyed by source_id for fast lookup */
  articles: Map<string, { title_ja: string; title_en: string | null; title_tl: string | null; slug: string }>;
  faqs: Map<string, { question_ja: string; question_en: string | null; question_tl: string | null }>;
}

async function fetchJoinMetadata(rows: RagChunkRow[]): Promise<JoinResult> {
  const articleIds = rows
    .filter((r) => r.source_type === "article")
    .map((r) => r.source_id);
  const faqIds = rows
    .filter((r) => r.source_type === "faq")
    .map((r) => r.source_id);
  const admin = getAdminClient();

  const articles = new Map<
    string,
    { title_ja: string; title_en: string | null; title_tl: string | null; slug: string }
  >();
  const faqs = new Map<
    string,
    { question_ja: string; question_en: string | null; question_tl: string | null }
  >();

  if (articleIds.length > 0) {
    const { data, error } = await admin
      .from("articles")
      .select("id, slug, title_ja, title_en, title_tl")
      .in("id", articleIds);
    if (error) throw new Error(`rag article join failed: ${error.message}`);
    for (const a of data ?? []) {
      articles.set(a.id, {
        slug: a.slug,
        title_ja: a.title_ja,
        title_en: a.title_en,
        title_tl: a.title_tl,
      });
    }
  }

  if (faqIds.length > 0) {
    const { data, error } = await admin
      .from("faqs")
      .select("id, question_ja, question_en, question_tl")
      .in("id", faqIds);
    if (error) throw new Error(`rag faq join failed: ${error.message}`);
    for (const f of data ?? []) {
      faqs.set(f.id, {
        question_ja: f.question_ja,
        question_en: f.question_en,
        question_tl: f.question_tl,
      });
    }
  }

  return { articles, faqs };
}

function pickTitle(
  source_type: "article" | "faq",
  source_id: string,
  locale: Locale,
  joined: JoinResult,
): string {
  if (source_type === "article") {
    const a = joined.articles.get(source_id);
    if (!a) return "(unknown article)";
    return (
      (locale === "en" && a.title_en) ||
      (locale === "tl" && a.title_tl) ||
      a.title_ja
    );
  }
  const f = joined.faqs.get(source_id);
  if (!f) return "(unknown faq)";
  return (
    (locale === "en" && f.question_en) ||
    (locale === "tl" && f.question_tl) ||
    f.question_ja
  );
}

/** Pure: combine RPC rows with the joined article / faq metadata. */
export function buildCitations(
  rows: RagChunkRow[],
  joined: JoinResult,
  locale: Locale,
): Citation[] {
  return rows.map((r) => ({
    source_type: r.source_type,
    source_id: r.source_id,
    language: r.language,
    similarity: r.similarity,
    slug:
      r.source_type === "article"
        ? joined.articles.get(r.source_id)?.slug ?? null
        : null,
    title: pickTitle(r.source_type, r.source_id, locale, joined),
    snippet: makeSnippet(r.chunk_text),
  }));
}

export interface RetrieveOptions {
  /** Max citations to return. Default 5. */
  limit?: number;
  /** Cosine similarity threshold. Default 0.3. */
  threshold?: number;
}

/**
 * Run the full RAG pipeline:
 *  1. embed(query, RETRIEVAL_QUERY, dim=768)
 *  2. RPC match_content with the user's locale as the soft-boost key
 *  3. join with articles / faqs to resolve title and slug
 *  4. format the REFERENCE block + return citations
 *
 * Empty result is fine: callers fall back to generating without
 * context (master plan §9 #1, #8).
 */
export async function retrieveContext(
  query: string,
  locale: Locale,
  opts: RetrieveOptions = {},
): Promise<RagResult> {
  const limit = opts.limit ?? 5;
  const threshold = opts.threshold ?? 0.3;

  // 1. Embed the query.
  const embedStart = Date.now();
  const embedded = await embed(query, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: 768,
  });
  const embedLatencyMs = Date.now() - embedStart;

  // 2. Call the RPC.
  const matchStart = Date.now();
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("match_content", {
    query_embedding: embedded.vector,
    match_language: locale,
    match_threshold: threshold,
    match_count: limit,
  });
  const matchLatencyMs = Date.now() - matchStart;
  if (error) {
    throw new Error(`rag match_content failed: ${error.message}`);
  }
  const rows = (data as RagChunkRow[] | null) ?? [];
  if (rows.length === 0) {
    return {
      contextText: "",
      citations: [],
      embedLatencyMs,
      matchLatencyMs,
      joinLatencyMs: 0,
    };
  }

  // 3. Join with articles / faqs.
  const joinStart = Date.now();
  const joined = await fetchJoinMetadata(rows);
  const joinLatencyMs = Date.now() - joinStart;

  // 4. Compose citations + context text.
  const citations = buildCitations(rows, joined, locale);
  const contextText = buildContextText(citations);

  console.log(
    `[rag] query locale=${locale} matched=${rows.length} embed=${embedLatencyMs}ms match=${matchLatencyMs}ms join=${joinLatencyMs}ms`,
  );

  return { contextText, citations, embedLatencyMs, matchLatencyMs, joinLatencyMs };
}
