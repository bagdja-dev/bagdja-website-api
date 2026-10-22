CREATE TABLE IF NOT EXISTS website_android_build_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(255) NOT NULL,
  builder_job_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT website_android_build_requests_website_key_unique
    UNIQUE (website_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_website_android_build_requests_website_created
  ON website_android_build_requests(website_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_android_build_requests_created
  ON website_android_build_requests(created_at);

COMMENT ON TABLE website_android_build_requests IS
  'Accepted Website Android build requests used for tenant-scoped rate limits and idempotent retries; records older than 24 hours are pruned during build admission.';
