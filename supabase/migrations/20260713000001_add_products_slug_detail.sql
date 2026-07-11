-- Halaman detail produk butuh slug per produk + konten detail (rich text)
ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
  ADD COLUMN IF NOT EXISTS detail TEXT;

-- Backfill slug untuk baris lama dari nama produk (+ suffix id supaya pasti unik tanpa perlu deteksi tabrakan)
UPDATE website_products
SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE website_products
  ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_products_website_id_slug_key'
  ) THEN
    ALTER TABLE website_products
      ADD CONSTRAINT website_products_website_id_slug_key UNIQUE (website_id, slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_website_products_slug ON website_products(website_id, slug);

COMMENT ON COLUMN website_products.slug IS 'Slug unik per website — dipakai URL halaman detail produk';
COMMENT ON COLUMN website_products.detail IS 'Konten detail produk (rich text/HTML) — ditampilkan di halaman detail, terpisah dari description singkat';
