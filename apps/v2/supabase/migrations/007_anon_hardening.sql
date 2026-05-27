-- =============================================================================
-- 007_anon_hardening.sql
-- =============================================================================
-- Anonymous (supabase.auth.signInAnonymously) users now bypass the
-- onboarding form and immediately get a session. They legitimately need
-- to create/read their own conversations and messages, but they have no
-- business writing to profiles / inquiries / consent_logs.
--
-- This migration tightens three existing self-write policies to ALSO
-- require is_anonymous IS NOT TRUE on the JWT. Anonymous callers still
-- pass auth.uid() = id, so the additional predicate is what stops them.
--
-- Idempotent via DROP POLICY IF EXISTS + CREATE.
--
-- Why these three:
--   - profiles UPDATE: prevents anon from flipping age_verified back to
--     false (would re-trigger onboarding) or rewriting prefecture_code
--     to game expert matching.
--   - inquiries INSERT: prevents anon from spamming the support inbox.
--     Anon testers send feedback via Slack/email per handoff §5.
--   - consent_logs INSERT: anon skips the consent form (ensureProfile
--     auto-stamps onboarded_at + age_verified), so there is no
--     legitimate path that needs to write here.
--
-- What we deliberately DON'T touch:
--   - conversations / messages: anon chat is the entire point of
--     anonymous sign-in. Writes must stay open.
--   - articles / faqs / experts / categories / restaurants public read
--   - SELECT-only policies (profiles_self_select, etc.): anon reading
--     their own (empty) rows is harmless.
--   - operator_takeover_logs / content_embeddings / webhook_logs:
--     already service_role-only via "RLS enabled, no policy".

-- profiles UPDATE: permanent users only
DROP POLICY IF EXISTS profiles_self_update ON profiles;
CREATE POLICY profiles_self_update ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- inquiries INSERT: permanent users only
DROP POLICY IF EXISTS inquiries_self_insert ON inquiries;
CREATE POLICY inquiries_self_insert ON inquiries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- consent_logs INSERT: permanent users only
DROP POLICY IF EXISTS consent_logs_self_insert ON consent_logs;
CREATE POLICY consent_logs_self_insert ON consent_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- =============================================================================
-- Verification
-- =============================================================================
-- Inspect the three rewritten policies. Each should show the
-- is_anonymous IS NOT TRUE predicate.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'profiles_self_update',
    'inquiries_self_insert',
    'consent_logs_self_insert'
  )
ORDER BY tablename, policyname;
