-- RLS verification (W3 C-9)
--
-- HOW TO RUN
--   Paste this whole file into Supabase Dashboard > SQL Editor and run.
--   The script wraps everything in BEGIN...ROLLBACK so test rows are
--   thrown away regardless of pass/fail. On success you will see one
--   "RLS test PASSED" notice. On failure the offending assertion
--   raises a clear EXCEPTION naming the table and the leak.
--
-- WHAT IT VERIFIES
--   1. anon (logged-out user) cannot SELECT:
--        - draft articles
--        - unpublished FAQs
--        - inactive experts
--      and CAN SELECT the public counterparts.
--   2. anon cannot SELECT private user data (profiles, conversations,
--      messages, consent_logs).
--   3. anon CAN SELECT categories (intentionally public).
--   4. authenticated user A cannot SELECT another user's profile,
--      conversation, message, or consent_logs (cross-tenant isolation).
--
-- LIMITATIONS
--   - This test cannot fully exercise SELECT policies that depend on
--     `auth.uid()` from a real Supabase Auth session header. We
--     simulate it by setting `request.jwt.claims`, which the Supabase
--     RLS helper reads, but a real-world bug in token verification is
--     out of scope here. That belongs in an integration test layer.
--   - Cross-user "other user's row" tests use placeholder UUIDs that
--     are unlikely to exist as real users; they verify the policy
--     denies, not that they would deny a real attacker mid-session.

BEGIN;

-- =============================================================================
-- Stage test rows as service_role / postgres (bypassing RLS).
-- =============================================================================

INSERT INTO articles (slug, status, title_ja, body_ja)
  VALUES ('rls_test_draft', 'draft', 'RLS test draft', 'body');
INSERT INTO articles (slug, status, title_ja, body_ja, published_at)
  VALUES ('rls_test_pub', 'published', 'RLS test pub', 'body', NOW());

INSERT INTO faqs (question_ja, answer_ja, is_published)
  VALUES ('RLS test unpub', 'a', false);
INSERT INTO faqs (question_ja, answer_ja, is_published)
  VALUES ('RLS test pub', 'a', true);

INSERT INTO experts (name, title, is_active)
  VALUES ('RLS test inactive', 't', false);
INSERT INTO experts (name, title, is_active)
  VALUES ('RLS test active', 't', true);

-- =============================================================================
-- Test 1: anon role
-- =============================================================================

DO $$
DECLARE
  c INT;
BEGIN
  -- Switch to anon for the duration of this block.
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', 'anon', true);

  -- 1a. articles: draft hidden, published visible
  SELECT COUNT(*) INTO c FROM articles WHERE slug = 'rls_test_draft';
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % draft article rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM articles WHERE slug = 'rls_test_pub';
  IF c <> 1 THEN
    RAISE EXCEPTION 'RLS REGRESSION: anon got % published article rows (expected 1)', c;
  END IF;

  -- 1b. faqs: unpublished hidden, published visible
  SELECT COUNT(*) INTO c FROM faqs WHERE question_ja = 'RLS test unpub';
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % unpublished faq rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM faqs WHERE question_ja = 'RLS test pub';
  IF c <> 1 THEN
    RAISE EXCEPTION 'RLS REGRESSION: anon got % published faq rows (expected 1)', c;
  END IF;

  -- 1c. experts: inactive hidden, active visible
  SELECT COUNT(*) INTO c FROM experts WHERE name = 'RLS test inactive';
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % inactive expert rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM experts WHERE name = 'RLS test active';
  IF c <> 1 THEN
    RAISE EXCEPTION 'RLS REGRESSION: anon got % active expert rows (expected 1)', c;
  END IF;

  -- 1d. private tables: anon must see zero of everything
  SELECT COUNT(*) INTO c FROM profiles;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % profile rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM conversations;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % conversation rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM messages;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % message rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM consent_logs;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % consent_log rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM admin_roles;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % admin_role rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM subscriptions;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % subscription rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM chat_usage;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: anon SELECTed % chat_usage rows (expected 0)', c;
  END IF;

  -- 1e. categories are intentionally public — every seed row must
  -- still be visible to anon.
  SELECT COUNT(*) INTO c FROM categories;
  IF c < 7 THEN
    RAISE EXCEPTION 'RLS REGRESSION: anon got % category rows (expected >= 7 seed)', c;
  END IF;

  RAISE NOTICE 'RLS test 1 (anon) PASSED';

  PERFORM set_config('role', 'postgres', true);
END $$;

-- =============================================================================
-- Test 2: authenticated user A cannot read user B's data
-- =============================================================================
-- Real user UUIDs would normally be staged here, but we keep the test
-- self-contained: we set auth.uid() to a placeholder UUID and assert
-- that the policy returns 0 rows from any user-scoped table. If the
-- policy were missing or wrong, even an arbitrary UUID would return
-- something for tables that have rows.

DO $$
DECLARE
  c INT;
  fake_uid TEXT := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', fake_uid, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);

  -- The fake user has no profile of their own and cannot see anyone
  -- else's. Same applies to all owner-scoped tables.
  SELECT COUNT(*) INTO c FROM profiles;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: fake authenticated user SELECTed % profile rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM conversations;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: fake authenticated user SELECTed % conversation rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM messages;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: fake authenticated user SELECTed % message rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM consent_logs;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: fake authenticated user SELECTed % consent_log rows (expected 0)', c;
  END IF;
  SELECT COUNT(*) INTO c FROM admin_roles;
  IF c <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: fake authenticated user SELECTed % admin_role rows (expected 0)', c;
  END IF;

  -- Public-read tables remain visible to authenticated users.
  SELECT COUNT(*) INTO c FROM categories;
  IF c < 7 THEN
    RAISE EXCEPTION 'RLS REGRESSION: authenticated got % category rows (expected >= 7)', c;
  END IF;

  RAISE NOTICE 'RLS test 2 (authenticated cross-user isolation) PASSED';

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- =============================================================================
-- Roll back so test rows do not pollute the database.
-- =============================================================================
ROLLBACK;
