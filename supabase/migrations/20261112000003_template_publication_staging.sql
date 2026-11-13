ALTER TABLE website_platform_template_submissions
  DROP CONSTRAINT IF EXISTS website_platform_template_submissions_publication_status_check;

ALTER TABLE website_platform_template_submissions
  ADD CONSTRAINT website_platform_template_submissions_publication_status_check
  CHECK (publication_status IN ('not_started', 'ready', 'validating', 'staged', 'failed', 'published', 'withdrawn'));
