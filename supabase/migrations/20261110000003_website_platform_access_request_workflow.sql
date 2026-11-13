ALTER TABLE website_platform_access_requests
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(320),
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS discussion_checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE website_platform_access_requests
  DROP CONSTRAINT IF EXISTS website_platform_access_requests_status_check;

ALTER TABLE website_platform_access_requests
  ADD CONSTRAINT website_platform_access_requests_status_check
  CHECK (status IN ('pending', 'curating', 'invited', 'discussion', 'approved', 'rejected'));

DROP INDEX IF EXISTS uq_website_platform_access_requests_pending_email;

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_platform_access_requests_active_email
  ON website_platform_access_requests(email)
  WHERE status IN ('pending', 'curating', 'invited', 'discussion');

CREATE INDEX IF NOT EXISTS idx_website_platform_access_requests_assigned_to
  ON website_platform_access_requests(assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;
