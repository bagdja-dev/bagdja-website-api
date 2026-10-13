CREATE TABLE IF NOT EXISTS website_event_rsvp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES website_event_groups(id) ON DELETE CASCADE,
  occurrence_id UUID NOT NULL REFERENCES website_gathering_occurrences(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL REFERENCES website_event_invitations(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  reservation_data JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_rsvp_challenges_pending_contact
  ON website_event_rsvp_challenges(invitation_id, email)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_website_event_rsvp_challenges_capacity
  ON website_event_rsvp_challenges(occurrence_id, status, expires_at);