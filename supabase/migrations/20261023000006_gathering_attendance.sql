-- Gathering hari-H (plan event-registration §5.5): acara dimulai, tiket QR, check-in.

-- 1. Status acara berjalan.
ALTER TABLE website_gathering_occurrences
  DROP CONSTRAINT IF EXISTS website_gathering_occurrences_status_check;
ALTER TABLE website_gathering_occurrences
  ADD CONSTRAINT website_gathering_occurrences_status_check
  CHECK (status IN ('DRAFT', 'PREORDER', 'RSVP_OPEN', 'PAYMENT_OPEN', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));

ALTER TABLE website_event_groups
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Tiket & kehadiran per seat. attendance_token = token acak di QR (bukan data pribadi).
ALTER TABLE website_event_registrations
  ADD COLUMN IF NOT EXISTS attendance_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS ticket_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS check_in_method VARCHAR(16);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_registrations_attendance_token
  ON website_event_registrations(attendance_token)
  WHERE attendance_token IS NOT NULL;

ALTER TABLE website_event_registrations
  DROP CONSTRAINT IF EXISTS website_event_registrations_check_in_method_check;
ALTER TABLE website_event_registrations
  ADD CONSTRAINT website_event_registrations_check_in_method_check
  CHECK (check_in_method IS NULL OR check_in_method IN ('SCAN', 'MANUAL'));

-- 3. Operasi pengiriman tiket lewat antrean (pola sama dengan INVOICE_ISSUANCE).
ALTER TABLE website_gathering_operations
  DROP CONSTRAINT IF EXISTS website_gathering_operations_kind_check;
ALTER TABLE website_gathering_operations
  ADD CONSTRAINT website_gathering_operations_kind_check
  CHECK (kind IN ('INVOICE_ISSUANCE', 'INVITATION_REVOCATION', 'INVITATION_DISPATCH', 'TICKET_ISSUANCE'));
