CREATE TABLE IF NOT EXISTS website_event_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES website_event_groups(id) ON DELETE CASCADE,
  invitee_name VARCHAR(255),
  email VARCHAR(320),
  whatsapp VARCHAR(32),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0 AND use_count <= max_uses),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_website_event_invitations_contact CHECK (email IS NOT NULL OR whatsapp IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_website_event_invitations_group_status
  ON website_event_invitations(website_id, group_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_invitations_pending_email
  ON website_event_invitations(group_id, lower(email))
  WHERE status = 'PENDING' AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_invitations_pending_whatsapp
  ON website_event_invitations(group_id, whatsapp)
  WHERE status = 'PENDING' AND whatsapp IS NOT NULL;

DROP TRIGGER IF EXISTS update_website_event_invitations_updated_at ON website_event_invitations;
CREATE TRIGGER update_website_event_invitations_updated_at
  BEFORE UPDATE ON website_event_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();