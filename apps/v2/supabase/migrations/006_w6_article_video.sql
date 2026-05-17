-- W6 / MVP-D: optional video embed on articles.
--
-- Adds two nullable columns to `articles`:
--   1. video_url        — full URL the editor pasted (validated app-side)
--   2. video_provider   — 'youtube' or 'vimeo'; the only providers the
--                         detail page knows how to render. Restricted by
--                         CHECK so a typo at INSERT time fails loudly.
--
-- Both columns are nullable; existing rows keep working with no video.
-- The migration is idempotent (IF NOT EXISTS) so it can be re-run
-- without effect, and the CHECK constraint is added defensively via
-- a DO block so a re-run does not error on the existing constraint.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_provider TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'articles_video_provider_check'
  ) THEN
    ALTER TABLE articles
      ADD CONSTRAINT articles_video_provider_check
        CHECK (video_provider IS NULL OR video_provider IN ('youtube', 'vimeo'));
  END IF;
END
$$;

-- Refresh PostgREST schema cache so the columns are visible to the
-- REST layer immediately (avoids the Lesson 24-style "Could not find
-- the column in schema cache" mode).
NOTIFY pgrst, 'reload schema';
