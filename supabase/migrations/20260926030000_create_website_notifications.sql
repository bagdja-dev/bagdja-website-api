CREATE TABLE IF NOT EXISTS website_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  action_label VARCHAR(80),
  action_url VARCHAR(500) NOT NULL,
  entity_type VARCHAR(80),
  entity_id VARCHAR(160),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_notifications_user_created_idx
  ON website_notifications (website_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS website_notifications_user_unread_idx
  ON website_notifications (website_id, user_id, read_at);
