-- =============================================================
-- website_categories — master kategori produk/layanan per-website
-- Menggantikan kolom website_products.category (teks bebas) supaya
-- kategori konsisten (tidak typo/duplikat) dan bisa punya foto sendiri.
-- =============================================================

CREATE TABLE IF NOT EXISTS website_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  label       VARCHAR(100) NOT NULL,
  images      JSONB NOT NULL DEFAULT '[]',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, label)
);

CREATE INDEX IF NOT EXISTS idx_website_categories_website_id ON website_categories(website_id);

DROP TRIGGER IF EXISTS trg_website_categories_updated_at ON website_categories;
CREATE TRIGGER trg_website_categories_updated_at
  BEFORE UPDATE ON website_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- Backfill: pindahkan nilai category (teks bebas) yang sudah ada di
-- website_products ke tabel baru (dikelompokkan per website_id + label
-- setelah TRIM). Idempotent lewat ON CONFLICT (website_id, label).
-- =============================================================
INSERT INTO website_categories (website_id, label)
SELECT DISTINCT website_id, TRIM(category)
FROM website_products
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (website_id, label) DO NOTHING;

-- Tambah kolom category_id, isi dari hasil backfill di atas
ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES website_categories(id) ON DELETE SET NULL;

UPDATE website_products wp
SET category_id = wc.id
FROM website_categories wc
WHERE wc.website_id = wp.website_id
  AND wc.label = TRIM(wp.category)
  AND wp.category IS NOT NULL
  AND TRIM(wp.category) <> '';

CREATE INDEX IF NOT EXISTS idx_website_products_category_id ON website_products(category_id);

-- Kolom category (varchar) lama sudah tidak dipakai — data sudah dipindah ke category_id.
DROP INDEX IF EXISTS idx_website_products_category;
ALTER TABLE website_products DROP COLUMN IF EXISTS category;
