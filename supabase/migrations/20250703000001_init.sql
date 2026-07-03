-- =============================================================
-- Bagdja Website Builder — Initial Schema
-- Phase 2: semua tabel inti
-- =============================================================

-- 1) Enable uuid extension (Supabase biasanya sudah aktif)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- website_templates (harus duluan, di-FK oleh websites)
-- =============================================================
CREATE TABLE IF NOT EXISTS website_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  preview_image VARCHAR(500),
  structure   JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- websites
-- =============================================================
CREATE TABLE IF NOT EXISTS websites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      VARCHAR(128) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  domain      VARCHAR(255),
  template_id UUID REFERENCES website_templates(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_websites_org_id ON websites(org_id);
CREATE INDEX IF NOT EXISTS idx_websites_slug   ON websites(slug);

-- =============================================================
-- website_pages
-- =============================================================
CREATE TABLE IF NOT EXISTS website_pages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  is_home     BOOLEAN NOT NULL DEFAULT false,
  "order"     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(website_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_website_pages_website_id ON website_pages(website_id);

-- =============================================================
-- website_sections
-- =============================================================
CREATE TABLE IF NOT EXISTS website_sections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id     UUID NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  type        VARCHAR(100) NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  "order"     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_sections_page_id ON website_sections(page_id);

-- =============================================================
-- tenant_staff
-- =============================================================
CREATE TABLE IF NOT EXISTS tenant_staff (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  email       VARCHAR(320),
  role        VARCHAR(50) NOT NULL DEFAULT 'viewer',
  permissions JSONB DEFAULT '{}',
  invited_by  UUID REFERENCES tenant_staff(id) ON DELETE SET NULL,
  invited_at  TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(website_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_staff_website_id ON tenant_staff(website_id);
CREATE INDEX IF NOT EXISTS idx_tenant_staff_user_id    ON tenant_staff(user_id);

-- =============================================================
-- staff_invitations
-- =============================================================
CREATE TABLE IF NOT EXISTS staff_invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  email       VARCHAR(320) NOT NULL,
  role        VARCHAR(50) NOT NULL DEFAULT 'editor',
  invited_by  UUID REFERENCES tenant_staff(id) ON DELETE SET NULL,
  token       VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_website_id ON staff_invitations(website_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token      ON staff_invitations(token);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email      ON staff_invitations(email);

-- =============================================================
-- website_products (opsional — katalog sederhana)
-- =============================================================
CREATE TABLE IF NOT EXISTS website_products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price       DECIMAL(12,2) NOT NULL DEFAULT 0,
  images      JSONB DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_products_website_id ON website_products(website_id);

-- =============================================================
-- Updated-at trigger (auto-update updated_at on row change)
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_websites_updated_at ON websites;
CREATE TRIGGER trg_websites_updated_at
  BEFORE UPDATE ON websites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_website_pages_updated_at ON website_pages;
CREATE TRIGGER trg_website_pages_updated_at
  BEFORE UPDATE ON website_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_website_sections_updated_at ON website_sections;
CREATE TRIGGER trg_website_sections_updated_at
  BEFORE UPDATE ON website_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_website_templates_updated_at ON website_templates;
CREATE TRIGGER trg_website_templates_updated_at
  BEFORE UPDATE ON website_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tenant_staff_updated_at ON tenant_staff;
CREATE TRIGGER trg_tenant_staff_updated_at
  BEFORE UPDATE ON tenant_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_website_products_updated_at ON website_products;
CREATE TRIGGER trg_website_products_updated_at
  BEFORE UPDATE ON website_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
