CREATE TABLE IF NOT EXISTS product_uoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO product_uoms (code, label, symbol, sort_order)
VALUES
  ('PCS', 'Pieces', 'pcs', 10),
  ('UNIT', 'Unit', 'unit', 20),
  ('SET', 'Set', 'set', 30),
  ('M', 'Meter', 'm', 40),
  ('M2', 'Square meter', 'm²', 50),
  ('M3', 'Cubic meter', 'm³', 60),
  ('KG', 'Kilogram', 'kg', 70),
  ('GRAM', 'Gram', 'g', 80),
  ('JAM', 'Hour', 'jam', 90),
  ('HARI', 'Day', 'hari', 100),
  ('PROJECT', 'Project', 'project', 110)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES product_uoms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_website_products_uom_id ON website_products(uom_id);
