ALTER TABLE website_event_groups
  ADD COLUMN IF NOT EXISTS invitation_banner_url TEXT,
  ADD COLUMN IF NOT EXISTS invitation_description TEXT;