-- =============================================================
-- Gathering product option table
-- Phase 1: product + option business model
-- =============================================================

CREATE TABLE IF NOT EXISTS website_event_product_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES website_products(id) ON DELETE CASCADE,
  option_group_key VARCHAR(64) NOT NULL,
  option_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  price_per_seat NUMERIC(12,2) NOT NULL CHECK (price_per_seat >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  min_attendees INTEGER NOT NULL DEFAULT 0 CHECK (min_attendees >= 0),
  max_attendees INTEGER NOT NULL CHECK (max_attendees > 0),
  availability_window JSONB NOT NULL DEFAULT '{}',
  venue_location TEXT,
  benefits JSONB NOT NULL DEFAULT '[]',
  cancellation_policy JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, option_group_key, option_key)
);

CREATE INDEX IF NOT EXISTS idx_website_event_product_options_product_id
  ON website_event_product_options(product_id);

CREATE INDEX IF NOT EXISTS idx_website_event_product_options_website_id
  ON website_event_product_options(website_id);

CREATE INDEX IF NOT EXISTS idx_website_event_product_options_group_key
  ON website_event_product_options(option_group_key);

DROP TRIGGER IF EXISTS update_website_event_product_options_updated_at ON website_event_product_options;
CREATE TRIGGER update_website_event_product_options_updated_at
  BEFORE UPDATE ON website_event_product_options
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
