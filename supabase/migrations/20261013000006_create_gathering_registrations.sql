CREATE TABLE IF NOT EXISTS website_event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES website_event_groups(id) ON DELETE CASCADE,
  occurrence_id UUID NOT NULL REFERENCES website_gathering_occurrences(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL UNIQUE REFERENCES website_event_invitations(id) ON DELETE RESTRICT,
  attendee_name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  whatsapp VARCHAR(32),
  selected_options JSONB NOT NULL DEFAULT '{}',
  registration_status VARCHAR(24) NOT NULL DEFAULT 'RSVP_CONFIRMED'
    CHECK (registration_status IN ('RSVP_CONFIRMED', 'CANCELLED')),
  payment_status VARCHAR(24) NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PENDING_PAYMENT', 'PAID', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_event_registrations_group_status
  ON website_event_registrations(website_id, group_id, registration_status, created_at);CREATE TABLE IF NOT EXISTS website_event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES website_event_groups(id) ON DELETE CASCADE,
  occurrence_id UUID NOT NULL REFERENCES website_gathering_occurrences(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL UNIQUE REFERENCES website_event_invitations(id) ON DELETE RESTRICT,
  attendee_name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  whatsapp VARCHAR(32),
  selected_options JSONB NOT NULL DEFAULT '{}',
  registration_status VARCHAR(24) NOT NULL DEFAULT 'RSVP_CONFIRMED'
    CHECK (registration_status IN ('RSVP_CONFIRMED', 'CANCELLED')),
  payment_status VARCHAR(24) NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PENDING_PAYMENT', 'PAID', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_event_registrations_group_status
  ON website_event_registrations(website_id, group_id, registration_status, created_at);