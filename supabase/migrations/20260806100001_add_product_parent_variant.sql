-- =============================================================
-- website_products.parent_product_id — dukungan varian produk
-- (mis. warna/ukuran). Setiap varian adalah row produk penuh
-- (harga/foto/stok/slug sendiri) — supaya nanti 1 varian = 1 SKU
-- kalau diintegrasikan ke Bagdja POS. Dikelompokkan via self-
-- reference ini, BUKAN tabel/JSON varian terpisah. Hierarki
-- dibatasi maksimal 1 level (validasi 2 arah di ProductsService,
-- bukan di level DB — konsisten dengan pola validasi lain di
-- codebase ini, mis. cek slug unik).
-- =============================================================

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS parent_product_id UUID REFERENCES website_products(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_website_products_parent_product_id ON website_products(parent_product_id);
