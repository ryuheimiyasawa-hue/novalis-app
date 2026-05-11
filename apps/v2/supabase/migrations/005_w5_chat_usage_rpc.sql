-- W5 atomic increment for chat_usage.
--
-- Replaces the UPSERT-then-fallback dance the E-5 JS layer would
-- otherwise need. Race condition that mattered: two concurrent
-- first-of-month sends would each INSERT count=1, ON CONFLICT
-- DO NOTHING — net result message_count=1 after both, so the
-- second user gets one extra free message. Single RPC fixes it.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.increment_chat_usage(
  p_user_id uuid,
  p_period text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO chat_usage (user_id, period_yyyymm, message_count, last_reset_at)
  VALUES (p_user_id, p_period, 1, NOW())
  ON CONFLICT (user_id, period_yyyymm)
  DO UPDATE SET message_count = chat_usage.message_count + 1
  RETURNING message_count INTO new_count;
  RETURN new_count;
END;
$function$;
