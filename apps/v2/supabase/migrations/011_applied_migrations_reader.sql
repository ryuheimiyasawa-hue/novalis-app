-- P0-B: expose the migration history to the app so it can detect drift.
--
-- Why a function at all: `supabase_migrations.schema_migrations` lives
-- outside the schemas PostgREST serves, so the service-role client
-- cannot read it with a plain `.from()`. A tiny SECURITY DEFINER
-- function in `public` is the supported way across that boundary.
--
-- Why the app needs it: twice now a migration existed in the repo but
-- had never been applied to production, and nothing noticed. Lesson 24
-- (`messages.citations` missing → every assistant message silently
-- failed to persist for 8 days) and Lesson 27 (`007_anon_hardening`
-- never applied → anonymous users could tamper with profiles while the
-- repo said otherwise). The repo, the handoff docs and the design notes
-- can all be stale; the catalog cannot. This function is what lets the
-- running app compare its own manifest against that catalog and say so
-- when they disagree.
--
-- Read-only, returns nothing but migration names, and is reachable only
-- by service_role (same policy as migration 008). Even so it exposes no
-- user data — the worst it can leak is which migrations exist.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.applied_migrations();

CREATE OR REPLACE FUNCTION public.applied_migrations()
RETURNS TABLE (name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $function$
  SELECT m.name
    FROM supabase_migrations.schema_migrations m
   WHERE m.name IS NOT NULL
   ORDER BY m.version;
$function$;

REVOKE EXECUTE ON FUNCTION public.applied_migrations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.applied_migrations() TO service_role;
