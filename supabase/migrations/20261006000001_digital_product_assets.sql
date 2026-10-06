ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS download_link_ttl_minutes INTEGER NOT NULL DEFAULT 4320;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_products_download_ttl_check'
  ) THEN
    ALTER TABLE website_products
      ADD CONSTRAINT website_products_download_ttl_check
      CHECK (download_link_ttl_minutes BETWEEN 1 AND 10080);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_orders_id_website_id_key'
  ) THEN
    ALTER TABLE website_orders
      ADD CONSTRAINT website_orders_id_website_id_key UNIQUE (id, website_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_products_id_website_id_key'
  ) THEN
    ALTER TABLE website_products
      ADD CONSTRAINT website_products_id_website_id_key UNIQUE (id, website_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS website_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  storage_file_id UUID NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  public_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT website_assets_id_website_id_key UNIQUE (id, website_id)
);

CREATE INDEX IF NOT EXISTS idx_website_assets_website_id_created_at
  ON website_assets (website_id, created_at DESC);

CREATE TABLE IF NOT EXISTS website_product_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL,
  product_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'download',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT website_product_assets_role_check
    CHECK (role IN ('download', 'attachment', 'preview')),
  CONSTRAINT website_product_assets_product_asset_key
    UNIQUE (product_id, asset_id),
  CONSTRAINT website_product_assets_product_website_fk
    FOREIGN KEY (product_id, website_id)
    REFERENCES website_products (id, website_id) ON DELETE CASCADE,
  CONSTRAINT website_product_assets_asset_website_fk
    FOREIGN KEY (asset_id, website_id)
    REFERENCES website_assets (id, website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_website_product_assets_product_sort
  ON website_product_assets (product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_product_assets_asset_id
  ON website_product_assets (asset_id);

CREATE TABLE IF NOT EXISTS website_order_asset_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  role VARCHAR(30) NOT NULL,
  email_to VARCHAR(320),
  email_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  last_email_attempt_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_url_issued_at TIMESTAMPTZ,
  last_url_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT website_order_asset_deliveries_role_check
    CHECK (role IN ('download', 'attachment')),
  CONSTRAINT website_order_asset_deliveries_status_check
    CHECK (email_status IN ('PENDING', 'SENT', 'FAILED')),
  CONSTRAINT website_order_asset_deliveries_order_asset_key
    UNIQUE (order_id, asset_id),
  CONSTRAINT website_order_asset_deliveries_order_website_fk
    FOREIGN KEY (order_id, website_id)
    REFERENCES website_orders (id, website_id) ON DELETE CASCADE,
  CONSTRAINT website_order_asset_deliveries_product_website_fk
    FOREIGN KEY (product_id, website_id)
    REFERENCES website_products (id, website_id) ON DELETE CASCADE,
  CONSTRAINT website_order_asset_deliveries_asset_website_fk
    FOREIGN KEY (asset_id, website_id)
    REFERENCES website_assets (id, website_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_website_order_asset_deliveries_order
  ON website_order_asset_deliveries (order_id, created_at);

DROP TRIGGER IF EXISTS update_website_assets_updated_at ON website_assets;
CREATE TRIGGER update_website_assets_updated_at
  BEFORE UPDATE ON website_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_website_product_assets_updated_at ON website_product_assets;
CREATE TRIGGER update_website_product_assets_updated_at
  BEFORE UPDATE ON website_product_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_website_order_asset_deliveries_updated_at ON website_order_asset_deliveries;
CREATE TRIGGER update_website_order_asset_deliveries_updated_at
  BEFORE UPDATE ON website_order_asset_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();