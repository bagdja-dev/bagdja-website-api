ALTER TABLE website_event_registrations
  ADD COLUMN IF NOT EXISTS payer_user_id UUID,
  ADD COLUMN IF NOT EXISTS invoice_is_public BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invoice_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_website_event_registrations_invoice_status
  ON website_event_registrations(website_id, payment_status, invoice_issued_at)
  WHERE registration_status = 'RSVP_CONFIRMED';
