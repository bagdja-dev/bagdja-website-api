ALTER TABLE website_platform_access_requests
  ADD COLUMN IF NOT EXISTS discussion_topic_id UUID;
