-- Consent flow 1.1: consent evidence outlives the account it belongs to.
--
-- Design gate: tasks/consent-1.1-design.md (§11 revision, 2026-09-13).
-- Source: lawyer review of 2026-08-10 (docs/lawyer-review-actions.md 2-5, 2-6).
--
-- Why:
--   consent_logs.user_id REFERENCES profiles(id) ON DELETE CASCADE, and
--   profiles.id REFERENCES auth.users ON DELETE CASCADE. So every
--   `auth.admin.deleteUser` — scripts/purge-anon-users.ts runs it for every
--   anonymous user older than 72h — wiped the consent trail with the user.
--   Privacy policy Art. 6 promises the opposite: consent logs are kept as
--   legal evidence even after a deletion request. Measured on 2026-09-13:
--   13 of the 15 rows belong to anonymous users, i.e. the next purge run
--   would have deleted most of the evidence we have.
--
-- What changes:
--   1. The FK is dropped. user_id keeps its name and still holds the auth
--      user id; it simply no longer depends on that user existing.
--   2. subject_kind records whether the consent came from an anonymous or a
--      permanent account, since auth.users can no longer be joined once the
--      account is gone.
--   3. terms_opened / privacy_opened record whether the user opened the full
--      text before agreeing (lawyer review 3-7: scroll-to-agree was declined
--      in favour of this).
--   4. The client-side INSERT policy is dropped. No code path inserts from a
--      user JWT — both /api/onboarding and /api/consent write with
--      service_role — and 008 shows what the policy was worth: an anonymous
--      JWT inserting straight into the legal trail. Writes now go only
--      through record_consent(), reachable by service_role alone.
--   5. record_consent() puts the log INSERT and the profiles UPDATE in one
--      transaction. Before this, a failed UPDATE after a successful INSERT
--      sent the user back to the form with the log already written.
--   6. consent_gate_state() lets the proxy read "onboarded?" and "latest
--      consented versions" in the one round-trip it already spends on
--      onboarded_at (Lesson 7: do not add a second query there).
--
-- Rollback (in this order):
--   DROP TRIGGER IF EXISTS consent_logs_fill_subject_kind ON public.consent_logs;
--   DROP FUNCTION IF EXISTS public.consent_logs_fill_subject_kind();
--   DROP FUNCTION IF EXISTS public.consent_gate_state();
--   DROP FUNCTION IF EXISTS public.record_consent(uuid, text, text, boolean, boolean, boolean);
--   CREATE POLICY consent_logs_self_insert ON public.consent_logs FOR INSERT
--     WITH CHECK (auth.uid() = user_id
--                 AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
--   -- NOT VALID: rows of purged users no longer have a profile to point at.
--   ALTER TABLE public.consent_logs ADD CONSTRAINT consent_logs_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
--   The added columns can stay; old code neither reads nor writes them.

-- -----------------------------------------------------------------------------
-- 1-3. Table shape
-- -----------------------------------------------------------------------------

ALTER TABLE public.consent_logs
  DROP CONSTRAINT IF EXISTS consent_logs_user_id_fkey;

ALTER TABLE public.consent_logs
  ADD COLUMN IF NOT EXISTS subject_kind   TEXT,
  ADD COLUMN IF NOT EXISTS terms_opened   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_opened BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the account type. Every existing row still has its auth user
-- (verified 2026-09-13); a row without one is labelled permanent, which is
-- what the pre-anonymous-trial data was.
UPDATE public.consent_logs c
   SET subject_kind = CASE WHEN u.is_anonymous THEN 'anonymous' ELSE 'permanent' END
  FROM auth.users u
 WHERE u.id = c.user_id
   AND c.subject_kind IS NULL;

UPDATE public.consent_logs
   SET subject_kind = 'permanent'
 WHERE subject_kind IS NULL;

-- Rollout window: this migration is applied BEFORE the new code deploys
-- (the new code calls record_consent, which does not exist until now). In
-- between, the old /api/onboarding still inserts rows without subject_kind.
-- NOT NULL alone would make every onboarding fail in that window, so fill
-- the value from auth.users when a writer leaves it out. record_consent sets
-- it explicitly; this only catches older writers.
CREATE OR REPLACE FUNCTION public.consent_logs_fill_subject_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.subject_kind IS NULL THEN
    SELECT CASE WHEN u.is_anonymous THEN 'anonymous' ELSE 'permanent' END
      INTO NEW.subject_kind
      FROM auth.users u
     WHERE u.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consent_logs_fill_subject_kind() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consent_logs_fill_subject_kind ON public.consent_logs;
CREATE TRIGGER consent_logs_fill_subject_kind
  BEFORE INSERT ON public.consent_logs
  FOR EACH ROW EXECUTE FUNCTION public.consent_logs_fill_subject_kind();

ALTER TABLE public.consent_logs
  ALTER COLUMN subject_kind SET NOT NULL;

ALTER TABLE public.consent_logs
  DROP CONSTRAINT IF EXISTS consent_logs_subject_kind_check;
ALTER TABLE public.consent_logs
  ADD CONSTRAINT consent_logs_subject_kind_check
  CHECK (subject_kind IN ('permanent', 'anonymous'));

-- The only read is "latest row for this user"; the old single-column index
-- is a prefix of this one.
CREATE INDEX IF NOT EXISTS idx_consent_logs_user_latest
  ON public.consent_logs (user_id, consented_at DESC);
DROP INDEX IF EXISTS public.idx_consent_logs_user_id;

-- -----------------------------------------------------------------------------
-- 4. RLS: no client-side writes
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS consent_logs_self_insert ON public.consent_logs;
-- consent_logs_self_select (auth.uid() = user_id) stays: consent_gate_state()
-- runs as the caller and reads through it.

-- -----------------------------------------------------------------------------
-- 5. record_consent: the only write path
-- -----------------------------------------------------------------------------
-- The caller (a route handler) has already authenticated the user and checked
-- the versions against CURRENT_*_VERSION, which lives in app code. This
-- function owns atomicity and subject_kind, nothing else.
--
-- p_mark_onboarded: true only from /api/onboarding, after the profile fields
-- were saved. /api/consent passes false so re-consent can never be used to
-- skip the prefecture step.

CREATE OR REPLACE FUNCTION public.record_consent(
  p_user_id         uuid,
  p_terms_version   text,
  p_privacy_version text,
  p_terms_opened    boolean,
  p_privacy_opened  boolean,
  p_mark_onboarded  boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_anonymous boolean;
  v_id uuid;
BEGIN
  SELECT u.is_anonymous INTO v_is_anonymous
    FROM auth.users u
   WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_consent: unknown user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.consent_logs
    (user_id, subject_kind, terms_version, privacy_version, age_verified,
     terms_opened, privacy_opened)
  VALUES
    (p_user_id,
     CASE WHEN v_is_anonymous THEN 'anonymous' ELSE 'permanent' END,
     p_terms_version, p_privacy_version, true,
     coalesce(p_terms_opened, false), coalesce(p_privacy_opened, false))
  RETURNING id INTO v_id;

  UPDATE public.profiles p
     SET age_verified = true,
         onboarded_at = CASE
           WHEN p_mark_onboarded THEN coalesce(p.onboarded_at, now())
           ELSE p.onboarded_at
         END,
         updated_at = now()
   WHERE p.id = p_user_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_consent(uuid, text, text, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_consent(uuid, text, text, boolean, boolean, boolean)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 6. consent_gate_state: one round-trip for the proxy
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it takes no user id and reads through the
-- caller's own RLS, so it can only ever describe the caller.

CREATE OR REPLACE FUNCTION public.consent_gate_state()
RETURNS TABLE (onboarded boolean, terms_version text, privacy_version text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
STABLE
AS $function$
  SELECT (p.onboarded_at IS NOT NULL),
         c.terms_version,
         c.privacy_version
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT cl.terms_version, cl.privacy_version
        FROM public.consent_logs cl
       WHERE cl.user_id = p.id
       ORDER BY cl.consented_at DESC
       LIMIT 1
    ) c ON true
   WHERE p.id = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.consent_gate_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consent_gate_state() TO authenticated, service_role;

-- =============================================================================
-- VERIFICATION (run separately after applying; Lesson 20 / 24 / 27)
-- =============================================================================
-- (0) Trigger present.
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.consent_logs'::regclass AND NOT tgisinternal;
--   Expect: consent_logs_fill_subject_kind.
-- (a) FK gone, CHECK present.
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.consent_logs'::regclass;
--   Expect: consent_logs_pkey, consent_logs_subject_kind_check. No *_fkey.
-- (b) Columns and backfill.
--   SELECT subject_kind, count(*) FROM public.consent_logs GROUP BY 1;
--   Expect (2026-09-13 data): anonymous 13, permanent 2. No NULL.
-- (c) Policies. Expect only consent_logs_self_select.
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'consent_logs';
-- (d) Privileges. record_consent: anon=f auth=f svc=t.
--     consent_gate_state: anon=f auth=t svc=t.
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_exec,
--          p.proconfig
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname IN ('record_consent', 'consent_gate_state');
