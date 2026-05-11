-- W5 RAG + persistence schema additions.
--
-- Two ALTERs and one CREATE OR REPLACE FUNCTION. All idempotent —
-- safe to re-run.
--
--   1. messages.citations JSONB     — RAG citation array on assistant
--                                     messages
--   2. profiles.chat_retention_permanent BOOLEAN
--                                   — opt-in for users who want their
--                                     conversation history kept beyond
--                                     the default 30-day auto-delete
--   3. match_content RPC updated    — return `language` column and use
--                                     soft locale boost in ORDER BY
--                                     (instead of strict WHERE filter)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chat_retention_permanent BOOLEAN NOT NULL DEFAULT false;

-- Replace the RAG retrieval function.
--   Changes vs the migration-001 version:
--     - new column `language` returned (caller can build citations
--       with locale info and apply UI-level locale labelling)
--     - WHERE no longer filters by language — instead, ORDER BY
--       prefers same-language matches via a tie-break. When the
--       caller is asking in JA and only EN chunks pass the threshold,
--       the EN chunks are still surfaced rather than the query
--       returning nothing
--   Kept:
--     - SECURITY DEFINER (callers run as service_role anyway, but
--       this lets a future RLS-tightened world still call the RPC)
--     - threshold 0.3 default, count 5 default
--
-- Note: CREATE OR REPLACE FUNCTION cannot change the return TABLE
-- shape of an existing function (PostgreSQL 42P13). We DROP first
-- so the migration is idempotent both on a fresh DB and on a DB
-- where the migration-001 version is still installed.
DROP FUNCTION IF EXISTS public.match_content(vector, text, double precision, integer);

CREATE OR REPLACE FUNCTION public.match_content(
  query_embedding vector,
  match_language text,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 5
) RETURNS TABLE(
  source_type text,
  source_id uuid,
  language text,
  chunk_text text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ce.source_type,
    ce.source_id,
    ce.language,
    ce.chunk_text,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM content_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY
    -- Locale tie-break: same-language matches sort first, then by
    -- raw cosine distance.
    CASE WHEN ce.language = match_language THEN 0 ELSE 1 END,
    ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
