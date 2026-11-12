ALTER TABLE website_platform_access_requests
  ADD COLUMN IF NOT EXISTS applicant_user_id UUID;
