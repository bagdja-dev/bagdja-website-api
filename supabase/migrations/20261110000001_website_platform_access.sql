CREATE TABLE IF NOT EXISTS website_platform_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email VARCHAR(320) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('designer', 'reviewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by UUID,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_website_platform_members_user_id UNIQUE (user_id),
  CONSTRAINT uq_website_platform_members_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS website_platform_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('designer', 'reviewer')),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_platform_invitations_pending_email
  ON website_platform_invitations(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS website_platform_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL,
  applicant_user_id UUID,
  name VARCHAR(120) NOT NULL,
  portfolio_url TEXT,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  review_note TEXT,
  invitation_id UUID REFERENCES website_platform_invitations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_platform_access_requests_status_created
  ON website_platform_access_requests(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_platform_access_requests_pending_email
  ON website_platform_access_requests(email)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS website_platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_platform_audit_logs_created
  ON website_platform_audit_logs(created_at DESC);
