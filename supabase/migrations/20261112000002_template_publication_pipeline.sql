ALTER TABLE website_platform_template_submissions
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS artifact_digest VARCHAR(64),
  ADD COLUMN IF NOT EXISTS publication_error TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE website_platform_template_submissions
  DROP CONSTRAINT IF EXISTS website_platform_template_submissions_publication_status_check;

ALTER TABLE website_platform_template_submissions
  ADD CONSTRAINT website_platform_template_submissions_publication_status_check
  CHECK (publication_status IN ('not_started', 'ready', 'validating', 'failed', 'published', 'withdrawn'));

UPDATE website_platform_template_submissions
SET publication_status = 'ready'
WHERE status = 'approved'
  AND publication_status = 'not_started';

CREATE INDEX IF NOT EXISTS idx_website_platform_template_submissions_publication
  ON website_platform_template_submissions(publication_status, updated_at DESC);
