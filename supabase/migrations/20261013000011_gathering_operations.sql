CREATE TABLE IF NOT EXISTS website_gathering_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES website_event_groups(id) ON DELETE CASCADE,
  initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('INVOICE_ISSUANCE', 'INVITATION_REVOCATION')),
  status VARCHAR(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  failed_items JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_gathering_operations_owner
  ON website_gathering_operations(website_id, group_id, initiator_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_gathering_operations_status
  ON website_gathering_operations(status, created_at)
  WHERE status IN ('QUEUED', 'RUNNING');
