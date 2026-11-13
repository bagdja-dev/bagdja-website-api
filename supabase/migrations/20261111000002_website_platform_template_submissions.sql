CREATE TABLE IF NOT EXISTS website_platform_template_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_user_id UUID NOT NULL,
  designer_email VARCHAR(320),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(63) NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  package_name VARCHAR(214) NOT NULL
    CHECK (package_name ~ '^(@[a-z0-9]([a-z0-9._-]{0,61}[a-z0-9])?/)?[a-z0-9]([a-z0-9._-]{0,61}[a-z0-9])?$'),
  package_version VARCHAR(100) NOT NULL
    CHECK (package_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-([0-9A-Za-z.-]+))?(\+[0-9A-Za-z.-]+)?$'),
  description TEXT NOT NULL,
  changelog TEXT NOT NULL,
  license VARCHAR(80) NOT NULL,
  demo_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected')),
  reviewer_user_id UUID,
  review_note TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_website_platform_template_submissions_package_version
    UNIQUE (package_name, package_version),
  CONSTRAINT uq_website_platform_template_submissions_slug_version
    UNIQUE (slug, package_version)
);

CREATE INDEX IF NOT EXISTS idx_website_platform_template_submissions_owner
  ON website_platform_template_submissions(designer_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_platform_template_submissions_queue
  ON website_platform_template_submissions(status, submitted_at DESC);
