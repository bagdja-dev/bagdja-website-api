ALTER TABLE website_platform_template_submissions
  ADD COLUMN IF NOT EXISTS github_url TEXT,
  ADD COLUMN IF NOT EXISTS discussion_topic_id UUID;
