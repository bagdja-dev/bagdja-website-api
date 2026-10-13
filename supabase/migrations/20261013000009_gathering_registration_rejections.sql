ALTER TABLE website_event_registrations
  DROP CONSTRAINT IF EXISTS website_event_registrations_registration_status_check;

ALTER TABLE website_event_registrations
  ADD CONSTRAINT website_event_registrations_registration_status_check
  CHECK (registration_status IN ('RSVP_CONFIRMED', 'CANCELLED', 'REJECTED'));

ALTER TABLE website_event_registrations
  ADD COLUMN IF NOT EXISTS rejection_message TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

DROP INDEX IF EXISTS uq_website_event_registration_invitation_email;

CREATE UNIQUE INDEX uq_website_event_registration_invitation_email
  ON website_event_registrations(invitation_id, lower(email))
  WHERE registration_status = 'RSVP_CONFIRMED';
