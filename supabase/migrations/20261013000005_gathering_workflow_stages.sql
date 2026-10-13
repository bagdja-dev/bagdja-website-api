ALTER TABLE website_event_groups
  ADD COLUMN IF NOT EXISTS workflow_step VARCHAR(32) NOT NULL DEFAULT 'PLAN';

ALTER TABLE website_event_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_status VARCHAR(16) NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

ALTER TABLE website_event_invitations
  DROP CONSTRAINT IF EXISTS chk_website_event_invitations_contact;

ALTER TABLE website_event_invitations
  ADD CONSTRAINT chk_website_event_invitations_contact
  CHECK (email IS NOT NULL OR whatsapp IS NOT NULL OR max_uses > 1);

ALTER TABLE website_event_groups
  ADD COLUMN IF NOT EXISTS invitation_submitted_at TIMESTAMPTZ;