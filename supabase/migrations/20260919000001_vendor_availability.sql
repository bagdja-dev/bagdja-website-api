-- Website Builder Phase 1: multi-vendor + product/location availability
CREATE TABLE IF NOT EXISTS website_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_whatsapp VARCHAR(50),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_vendor_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES website_vendors(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES website_locations(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, location_id)
);

CREATE TABLE IF NOT EXISTS website_product_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES website_products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES website_locations(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

ALTER TABLE website_orders
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES website_locations(id),
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES website_vendors(id);

CREATE INDEX IF NOT EXISTS idx_website_vendors_website_id ON website_vendors(website_id);
CREATE INDEX IF NOT EXISTS idx_website_vendor_locations_vendor_id ON website_vendor_locations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_website_vendor_locations_location_id ON website_vendor_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_website_product_locations_product_id ON website_product_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_website_product_locations_location_id ON website_product_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_website_orders_location_id ON website_orders(location_id);
CREATE INDEX IF NOT EXISTS idx_website_orders_vendor_id ON website_orders(vendor_id);

DROP TRIGGER IF EXISTS update_website_vendors_updated_at ON website_vendors;
CREATE TRIGGER update_website_vendors_updated_at
  BEFORE UPDATE ON website_vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_website_vendor_locations_updated_at ON website_vendor_locations;
CREATE TRIGGER update_website_vendor_locations_updated_at
  BEFORE UPDATE ON website_vendor_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_website_product_locations_updated_at ON website_product_locations;
CREATE TRIGGER update_website_product_locations_updated_at
  BEFORE UPDATE ON website_product_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
