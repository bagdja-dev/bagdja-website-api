-- Tambah kolom category (teks bebas) di website_products — pengelompokan tambahan di dalam satu type
ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS category VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_website_products_category ON website_products(category);

COMMENT ON COLUMN website_products.category IS 'Kategori bebas dalam satu type, mis. type=service -> category="Potong Rambut"';
