-- =============================================================
-- website_products.payment_meta — daftar cara/link pembayaran
-- checkout untuk produk (array of object, polymorphic per
-- `payment_mode`). Mode pertama: LYNK.
--   { "payment_mode": "LYNK", "payment_link": "https://lynk.id/..." }
-- Kolom tetap jsonb generik supaya mode baru (transfer bank, QRIS,
-- dst.) cukup nambah shape baru di array — tanpa migration lagi.
-- =============================================================

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS payment_meta JSONB NOT NULL DEFAULT '[]';
