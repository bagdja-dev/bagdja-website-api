-- ═══════════════════════════════════════════════════════════
-- Default payment_meta = ADD_TO_CART untuk produk yang belum punya
-- cara checkout (W3/W1b plan website-builder).
--
-- Tujuan: semua produk otomatis bisa dibeli lewat cart Bagdja, kecuali
-- admin sudah memilih mode lain (LYNK/ESCROW). Migration ini hanya
-- backfill produk yang payment_meta-nya kosong/null — TIDAK menimpa
-- produk yang sudah punya mode checkout.
--
-- Catatan: berlaku juga untuk produk varian (row dengan parent_product_id),
-- karena di renderer varian punya halaman detail sendiri yang bisa
-- menampilkan tombol cart. Kalau nanti ingin varian TIDAK bisa dibeli
-- terpisah, filter tambahan `parent_product_id IS NULL` perlu ditambah.
-- ═══════════════════════════════════════════════════════════

UPDATE website_products
SET payment_meta = '[{"payment_mode":"ADD_TO_CART"}]'::jsonb
WHERE payment_meta IS NULL
   OR payment_meta = '[]'::jsonb;
