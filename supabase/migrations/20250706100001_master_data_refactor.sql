-- =============================================================
-- Phase 6.5A: Master Data Architecture Refactor
-- - websites: profil brand (tagline, logo, kontak)
-- - website_products: type, metadata, sort_order
-- - website_locations: cabang, gudang, pickup
-- - website_faqs: Q&A terstruktur
-- =============================================================

-- Supabase: gunakan gen_random_uuid() dari pgcrypto (bukan uuid-ossp)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── websites: kolom profil brand ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'tagline') THEN
    ALTER TABLE websites ADD COLUMN tagline VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'logo_url') THEN
    ALTER TABLE websites ADD COLUMN logo_url VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'whatsapp') THEN
    ALTER TABLE websites ADD COLUMN whatsapp VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'phone') THEN
    ALTER TABLE websites ADD COLUMN phone VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'email') THEN
    ALTER TABLE websites ADD COLUMN email VARCHAR(320);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'social_links') THEN
    ALTER TABLE websites ADD COLUMN social_links JSONB NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'websites' AND column_name = 'opening_hours') THEN
    ALTER TABLE websites ADD COLUMN opening_hours JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ─── website_products: type, metadata, sort_order ───────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'website_products' AND column_name = 'type') THEN
    ALTER TABLE website_products ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'product';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'website_products' AND column_name = 'metadata') THEN
    ALTER TABLE website_products ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'website_products' AND column_name = 'sort_order') THEN
    ALTER TABLE website_products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_website_products_type ON website_products(website_id, type);

-- ─── website_locations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id    UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(50) NOT NULL DEFAULT 'branch',
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  address_line  VARCHAR(500),
  city          VARCHAR(100),
  province      VARCHAR(100),
  postal_code   VARCHAR(20),
  latitude      DECIMAL(10, 7),
  longitude     DECIMAL(10, 7),
  phone         VARCHAR(50),
  whatsapp      VARCHAR(50),
  opening_hours JSONB NOT NULL DEFAULT '{}',
  maps_url      VARCHAR(500),
  maps_embed    TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_locations_website_id ON website_locations(website_id);
CREATE INDEX IF NOT EXISTS idx_website_locations_type ON website_locations(website_id, type);

DROP TRIGGER IF EXISTS trg_website_locations_updated_at ON website_locations;
CREATE TRIGGER trg_website_locations_updated_at
  BEFORE UPDATE ON website_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── website_faqs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_faqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  category    VARCHAR(50),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_public   BOOLEAN NOT NULL DEFAULT true,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_faqs_website_id ON website_faqs(website_id);
CREATE INDEX IF NOT EXISTS idx_website_faqs_category ON website_faqs(website_id, category);

DROP TRIGGER IF EXISTS trg_website_faqs_updated_at ON website_faqs;
CREATE TRIGGER trg_website_faqs_updated_at
  BEFORE UPDATE ON website_faqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
