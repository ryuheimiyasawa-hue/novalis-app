-- =============================================================================
-- 008_security_hardening.sql
-- =============================================================================
-- APPLIED TO PRODUCTION 2026-06-25 via Supabase apply_migration (name:
-- 008_security_hardening). All four verification checks (a)-(d) passed and the
-- advisor's 4 function_search_path_mutable warnings cleared. This file keeps
-- the BEGIN/COMMIT wrapper + verification block for SQL-Editor re-runs and as
-- the canonical record; the applied form omitted the explicit transaction
-- (the MCP wraps it) and the trailing SELECTs.
--
-- Phase 2 / M0 (P0-A). Makes the production-safe security posture
-- reproducible from migration history, and closes a live RLS gap.
--
-- Why this migration exists (measured against production 2026-06-25):
--
--   1. ANON HARDENING DRIFT (live, high-impact). 007_anon_hardening.sql
--      exists in the repo but was never applied to production. pg_policies
--      shows profiles_self_update / inquiries_self_insert /
--      consent_logs_self_insert WITHOUT the is_anonymous predicate, so an
--      anonymous (signInAnonymously) user can UPDATE their own profile
--      (flip age_verified back to false, rewrite prefecture_code) and INSERT
--      directly into inquiries / consent_logs (spam the support inbox,
--      pollute the legal consent trail). This migration RE-APPLIES the three
--      007 policies idempotently so a single run closes the gap regardless
--      of whether 007 ever ran.
--
--   2. FUNCTION EXECUTE NOT REVOKED IN HISTORY (reproducibility / DoS).
--      On production, increment_chat_usage / match_content / handle_new_user
--      already have anon = authenticated = EXECUTE:false (manual SQL), but no
--      REVOKE exists in any migration. PostgreSQL grants EXECUTE to PUBLIC by
--      default at function creation, so a fresh DB built from migrations would
--      re-open the DoS (anon EXECUTE on the SECURITY DEFINER
--      increment_chat_usage bypasses RLS to exhaust any user's quota). We
--      REVOKE FROM PUBLIC (the effective grantor) and re-GRANT to service_role
--      so the app keeps working.
--
--   3. SEARCH_PATH MUTABLE on 4 functions (proconfig=null, advisor WARN).
--      SECURITY DEFINER functions without a fixed search_path are a privilege
--      escalation surface. We pin SET search_path = '' and fully schema-qualify
--      every object reference (incl. the pgvector <=> operator, which lives in
--      the public schema) so the functions keep resolving with an empty path.
--
-- Idempotent. Safe to re-run. Wrapped in a single transaction so a mid-script
-- error rolls the whole thing back (Lesson 24: no partial application).
--
-- DDL approval gate (Lesson 24): apply via Supabase SQL Editor, then run the
-- VERIFICATION block at the bottom and confirm every row matches the expected
-- value before declaring done.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Part 1. Anon hardening (re-apply 007 idempotently)
-- -----------------------------------------------------------------------------
-- profiles UPDATE: permanent users only
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- inquiries INSERT: permanent users only
DROP POLICY IF EXISTS inquiries_self_insert ON public.inquiries;
CREATE POLICY inquiries_self_insert ON public.inquiries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- consent_logs INSERT: permanent users only
DROP POLICY IF EXISTS consent_logs_self_insert ON public.consent_logs;
CREATE POLICY consent_logs_self_insert ON public.consent_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- -----------------------------------------------------------------------------
-- Part 2. Pin search_path on all 4 functions (CREATE OR REPLACE preserves
--         dependent triggers; bodies are fully schema-qualified so an empty
--         search_path still resolves every object).
-- -----------------------------------------------------------------------------

-- set_updated_at: trigger fn (not SECURITY DEFINER). Body only touches NEW and
-- now() (pg_catalog, always on path) -> empty search_path is safe as-is.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- handle_new_user: SECURITY DEFINER trigger. Already writes to public.profiles
-- (qualified); pin the path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id,
    facebook_id,
    display_name,
    email,
    avatar_url,
    prefecture_code,
    city_name,
    trial_started_at,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    '',
    '',
    now(),
    now() + INTERVAL '30 days'
  );
  RETURN NEW;
END;
$function$;

-- match_content: SECURITY DEFINER. Qualify public.content_embeddings and the
-- pgvector distance operator as OPERATOR(public.<=>) so an empty search_path
-- resolves them. Return shape is unchanged (matches the 004 version), so
-- CREATE OR REPLACE is valid without DROP.
CREATE OR REPLACE FUNCTION public.match_content(
  query_embedding public.vector,
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
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ce.source_type,
    ce.source_id,
    ce.language,
    ce.chunk_text,
    1 - (ce.embedding OPERATOR(public.<=>) query_embedding) AS similarity
  FROM public.content_embeddings ce
  WHERE 1 - (ce.embedding OPERATOR(public.<=>) query_embedding) > match_threshold
  ORDER BY
    CASE WHEN ce.language = match_language THEN 0 ELSE 1 END,
    ce.embedding OPERATOR(public.<=>) query_embedding
  LIMIT match_count;
END;
$function$;

-- increment_chat_usage: SECURITY DEFINER. Qualify public.chat_usage; alias the
-- target so the ON CONFLICT SET is unambiguous under an empty search_path.
CREATE OR REPLACE FUNCTION public.increment_chat_usage(
  p_user_id uuid,
  p_period text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.chat_usage AS cu (user_id, period_yyyymm, message_count, last_reset_at)
  VALUES (p_user_id, p_period, 1, now())
  ON CONFLICT (user_id, period_yyyymm)
  DO UPDATE SET message_count = cu.message_count + 1
  RETURNING cu.message_count INTO new_count;
  RETURN new_count;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Part 3. Lock down EXECUTE on the SECURITY DEFINER functions.
--         REVOKE FROM PUBLIC is the effective change (anon/authenticated only
--         ever inherited EXECUTE via PUBLIC). Re-grant service_role so the app
--         (admin client) keeps calling them. handle_new_user needs no grant:
--         it fires as a trigger, which does not check EXECUTE privilege.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.match_content(public.vector, text, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.match_content(public.vector, text, double precision, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;

-- =============================================================================
-- VERIFICATION (run after COMMIT; every row must match the expected value)
-- =============================================================================

-- (a) The three policies must now carry the is_anonymous predicate.
--     Expect: each row's expression contains "is_anonymous".
SELECT tablename, policyname, cmd,
       qual        AS using_expr,
       with_check  AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('profiles_self_update', 'inquiries_self_insert', 'consent_logs_self_insert')
ORDER BY tablename, policyname;

-- (b) EXECUTE privileges. Expect anon=f, authenticated=f, service_role=t
--     for all three SECURITY DEFINER functions.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('increment_chat_usage', 'match_content', 'handle_new_user')
ORDER BY p.proname;

-- (c) search_path must be pinned. Expect proconfig = {search_path=""} on all 4.
SELECT p.proname, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('set_updated_at', 'handle_new_user', 'match_content', 'increment_chat_usage')
ORDER BY p.proname;

-- (d) Smoke: confirm match_content still resolves the qualified operator under
--     the empty search_path (returns 0 rows, but must NOT raise
--     "operator does not exist"). Uses a zero vector of the right dimension.
SELECT * FROM public.match_content(
  (SELECT ('[' || array_to_string(array_fill(0::float, ARRAY[768]), ',') || ']')::public.vector),
  'ja', 0.99, 1
);
