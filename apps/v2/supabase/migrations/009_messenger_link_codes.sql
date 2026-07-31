-- =============================================================================
-- 009_messenger_link_codes.sql
-- =============================================================================
-- Phase 2 / P2-K follow-up. Adds the storage needed for self-serve Messenger
-- account linking.
--
-- Why this migration exists:
--
--   messenger_links (001) is READ by the Messenger webhook but nothing ever
--   WROTE it — the only production row was inserted by hand. Any new Messenger
--   user therefore hits the "アカウントの連携が必要です" branch forever, because
--   logging in on the web does not create the link. That makes tester rollout
--   impossible.
--
--   The linking flow needs a short-lived shared secret that the user can carry
--   from the authenticated web session into an unauthenticated Messenger
--   thread: the user requests a code in the app, sends it to the bot, and the
--   webhook exchanges it for a messenger_links row.
--
-- Design notes:
--
--   * code is the PRIMARY KEY. It is a 6-character string from a 32-symbol
--     ambiguity-free alphabet (no I/O/0/1), i.e. ~1.07e9 values. Codes are
--     single-use and expire in minutes, and at most one is active per user
--     (the API invalidates the previous one), so the guessable surface is a
--     handful of live values at any instant.
--   * Claiming is a conditional UPDATE ... WHERE used_at IS NULL AND
--     expires_at > now() RETURNING user_id, which is atomic — a duplicate
--     Messenger delivery cannot bind the same code twice.
--   * RLS is enabled with NO policies, the house convention for internal
--     tables reachable only by the service role (cf. webhook_logs,
--     operator_takeover_logs, content_embeddings in 001). The user never
--     SELECTs this table; the API returns the code in its response body.
--   * ON DELETE CASCADE mirrors messenger_links so purging a profile (e.g. the
--     anonymous-user purge job) leaves no orphan codes.
--
-- What this migration deliberately does NOT touch: messenger_links itself, any
-- existing policy, and any chat/message table.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.messenger_link_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Lookup by owner (invalidate-previous on re-issue) and a sweep index for
-- deleting expired rows.
CREATE INDEX IF NOT EXISTS idx_messenger_link_codes_user
  ON public.messenger_link_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_link_codes_expires
  ON public.messenger_link_codes(expires_at);

-- Service-role only: RLS on, no policies (see design notes).
ALTER TABLE public.messenger_link_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.messenger_link_codes FROM PUBLIC;
REVOKE ALL ON public.messenger_link_codes FROM anon, authenticated;
GRANT ALL ON public.messenger_link_codes TO service_role;

COMMIT;

-- =============================================================================
-- Verification (run manually after applying)
-- =============================================================================
-- (a) Table exists with the expected columns.
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'messenger_link_codes'
--  ORDER BY ordinal_position;
--
-- (b) RLS enabled and NO policies (service-role only).
-- SELECT relrowsecurity FROM pg_class
--  WHERE oid = 'public.messenger_link_codes'::regclass;               -- expect t
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'messenger_link_codes'; -- expect 0
--
-- (c) anon / authenticated hold no privileges.
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name = 'messenger_link_codes'
--  ORDER BY grantee;                          -- expect service_role rows only
