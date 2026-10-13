ALTER TABLE website_event_registrations
  ADD COLUMN IF NOT EXISTS buyer_user_id UUID,
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES website_orders(id) ON DELETE SET NULL;

ALTER TABLE website_event_registrations
  DROP CONSTRAINT IF EXISTS website_event_registrations_invitation_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_registration_invitation_email
  ON website_event_registrations(invitation_id, lower(email));

ALTER TABLE website_event_invitations
  DROP CONSTRAINT IF EXISTS chk_website_event_invitations_contact;