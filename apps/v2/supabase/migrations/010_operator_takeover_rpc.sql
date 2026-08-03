-- P2-B2 operator takeover / release as single-transaction RPCs.
--
-- Why an RPC instead of two calls from the app layer:
--
--   1. ATOMIC AUDIT TRAIL. `conversations.mode` and the row in
--      `operator_takeover_logs` must agree or the log is worthless.
--      Doing UPDATE then INSERT from JS leaves a window where the AI
--      is silenced with no record of who silenced it. One function =
--      one transaction = both or neither.
--
--   2. FREE MUTUAL EXCLUSION. The conditional UPDATE
--      (`WHERE mode = 'auto'`) takes the row lock and lets exactly one
--      concurrent takeover win. The loser sees 0 updated rows and gets
--      the current holder back, so the app needs no optimistic
--      versioning of its own.
--
-- Both functions are idempotent for the *same* actor: re-running a
-- takeover you already hold (or a release on an already-auto
-- conversation) succeeds without writing a duplicate log row.
--
-- Security follows migration 008: SECURITY DEFINER + pinned empty
-- search_path + every object schema-qualified, EXECUTE revoked from
-- PUBLIC/anon/authenticated and granted only to service_role. These
-- functions mutate conversation state, so an anon-key caller must
-- never be able to reach them.

-- =============================================================================
-- operator_takeover
-- =============================================================================
-- outcome:
--   'taken'        — mode flipped auto -> operator, log written
--   'already_self' — caller already holds it, nothing written
--   'conflict'     — another operator holds it (see returned ids)
--   'not_found'    — no such conversation
CREATE OR REPLACE FUNCTION public.operator_takeover(
  p_conversation_id uuid,
  p_operator_user_id uuid,
  p_reason text DEFAULT NULL
) RETURNS TABLE (
  outcome text,
  conv_mode text,
  conv_operator_user_id uuid,
  conv_operator_started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.conversations%ROWTYPE;
BEGIN
  -- Conditional UPDATE: only an 'auto' conversation can be taken over.
  -- This both claims the row and locks out the concurrent caller.
  UPDATE public.conversations
     SET mode = 'operator',
         operator_user_id = p_operator_user_id,
         operator_started_at = NOW()
   WHERE id = p_conversation_id
     AND mode = 'auto'
  RETURNING * INTO v_row;

  IF FOUND THEN
    INSERT INTO public.operator_takeover_logs
      (conversation_id, operator_user_id, action, reason)
    VALUES
      (p_conversation_id, p_operator_user_id, 'takeover', p_reason);

    RETURN QUERY SELECT
      'taken'::text, v_row.mode, v_row.operator_user_id, v_row.operator_started_at;
    RETURN;
  END IF;

  -- Nothing updated: either the conversation is gone or it is already
  -- in operator mode. Report which, so the caller can tell 404 from 409.
  SELECT * INTO v_row FROM public.conversations WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.operator_user_id = p_operator_user_id THEN
    RETURN QUERY SELECT
      'already_self'::text, v_row.mode, v_row.operator_user_id, v_row.operator_started_at;
  ELSE
    RETURN QUERY SELECT
      'conflict'::text, v_row.mode, v_row.operator_user_id, v_row.operator_started_at;
  END IF;
END;
$function$;

-- =============================================================================
-- operator_release
-- =============================================================================
-- p_force lets an admin recover a conversation whose operator walked
-- away; the forced release is still logged (reason is recorded by the
-- caller). outcome:
--   'released'     — mode flipped operator -> auto, log written
--   'already_auto' — nothing to release, nothing written
--   'conflict'     — held by someone else and p_force is false
--   'not_found'    — no such conversation
CREATE OR REPLACE FUNCTION public.operator_release(
  p_conversation_id uuid,
  p_operator_user_id uuid,
  p_force boolean DEFAULT false,
  p_reason text DEFAULT NULL
) RETURNS TABLE (
  outcome text,
  conv_mode text,
  conv_operator_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.conversations%ROWTYPE;
BEGIN
  UPDATE public.conversations
     SET mode = 'auto',
         operator_user_id = NULL,
         operator_started_at = NULL
   WHERE id = p_conversation_id
     AND mode = 'operator'
     AND (p_force OR operator_user_id = p_operator_user_id)
  RETURNING * INTO v_row;

  IF FOUND THEN
    INSERT INTO public.operator_takeover_logs
      (conversation_id, operator_user_id, action, reason)
    VALUES
      (p_conversation_id, p_operator_user_id, 'release', p_reason);

    RETURN QUERY SELECT 'released'::text, v_row.mode, v_row.operator_user_id;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.conversations WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_row.mode = 'auto' THEN
    RETURN QUERY SELECT 'already_auto'::text, v_row.mode, v_row.operator_user_id;
  ELSE
    RETURN QUERY SELECT 'conflict'::text, v_row.mode, v_row.operator_user_id;
  END IF;
END;
$function$;

-- =============================================================================
-- EXECUTE privileges (migration 008 policy)
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.operator_takeover(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.operator_takeover(uuid, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.operator_release(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.operator_release(uuid, uuid, boolean, text) TO service_role;
