-- ============================================================
-- Migration: usage-sum RPCs for server-side quota enforcement (W3.2)
-- ============================================================
-- The TTS quota check previously counted usage_log ROWS, not characters
-- (review-05 #1), so the cap was effectively unreachable. These SECURITY
-- DEFINER functions sum the `quantity` column (= chars for TTS, seconds for
-- STT, tokens for LLM) over a time window. Auth-guarded like the W1.1 RPCs:
-- service_role passes; a user may only read their own usage; anon is denied.
-- ============================================================

-- Monthly usage sum (calendar month) — TTS chars, STT seconds, LLM tokens.
CREATE OR REPLACE FUNCTION get_monthly_usage(p_user_id UUID, p_event_type TEXT)
RETURNS BIGINT AS $$
DECLARE total BIGINT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cannot read another user''s usage';
  END IF;
  SELECT COALESCE(SUM(quantity), 0) INTO total
  FROM usage_logs
  WHERE user_id = p_user_id
    AND event_type = p_event_type
    AND status = 'ok'
    AND created_at >= date_trunc('month', now());
  RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_monthly_usage(UUID, TEXT) FROM anon;

-- Daily usage sum (rolling calendar day) — used by the daily hard-cap backstop.
CREATE OR REPLACE FUNCTION get_daily_usage(p_user_id UUID, p_event_type TEXT)
RETURNS BIGINT AS $$
DECLARE total BIGINT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cannot read another user''s usage';
  END IF;
  SELECT COALESCE(SUM(quantity), 0) INTO total
  FROM usage_logs
  WHERE user_id = p_user_id
    AND event_type = p_event_type
    AND status = 'ok'
    AND created_at >= date_trunc('day', now());
  RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_daily_usage(UUID, TEXT) FROM anon;

-- Seed quota enforcement flags (default OFF = log-only soft launch).
INSERT INTO system_config (key, value, description) VALUES
  ('quota.tts_hard_enforce', '{"enabled": false}', 'When true, TTS monthly char cap returns 429; else log-only.'),
  ('quota.stt_hard_enforce', '{"enabled": false}', 'When true, STT monthly seconds cap denies tokens; else log-only.'),
  ('quota.exchange_hard_enforce', '{"enabled": false}', 'When true, PAID exchange cap returns 429; free tier is always enforced.'),
  ('quota.daily_caps_enforce', '{"enabled": false}', 'When true, user_hard_caps daily limits are enforced; else log-only.')
ON CONFLICT (key) DO NOTHING;
