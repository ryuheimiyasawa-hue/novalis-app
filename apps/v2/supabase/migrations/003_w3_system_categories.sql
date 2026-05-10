-- Migration 003 (W3): protect seed categories from accidental deletion / rename.
--
-- The 7 categories seeded in migration 001 (visa / social_ins / family /
-- school / admin_proc / escalation / restaurants) drive AI chat routing
-- and the public category navigation. Losing or renaming any of them
-- silently breaks core product behavior, so we mark them as `is_system`
-- and the admin API refuses destructive changes against rows where this
-- flag is true.
--
-- Note: the trigger / RLS layer is intentionally not used. Protection
-- lives in the API (route handlers) so admins running ad-hoc SQL via the
-- Supabase Dashboard can still recover from genuine emergencies. The
-- threat we are blocking is a stray click in the admin UI.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

UPDATE categories
  SET is_system = true
  WHERE slug IN (
    'visa',
    'social_ins',
    'family',
    'school',
    'admin_proc',
    'escalation',
    'restaurants'
  );
