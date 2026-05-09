-- =============================================================================
-- W2 — Consent log (simplified) + onboarding marker
-- =============================================================================

-- profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_verified BOOLEAN NOT NULL DEFAULT false;

-- Replace the consent_logs schema from migration 001 with the simplified one.
DROP TABLE IF EXISTS consent_logs;

CREATE TABLE consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  age_verified BOOLEAN NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consent_logs_user_id ON consent_logs(user_id);

ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_logs_self_select
  ON consent_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY consent_logs_self_insert
  ON consent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies are defined: PostgreSQL denies these
-- operations for non-service-role connections by default. The service_role
-- can still mutate if needed for ops, but the application code never does.
