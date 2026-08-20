-- ═══════════════════════════════════════════════════════════
-- Escrow Product per-website (bukan lagi per-produk).
--
-- Sebelumnya `ensureEscrowProduct()` bikin 1 escrow_product per website
-- PRODUCT (disimpan di product.metadata.escrow_product_id) — untuk
-- transaksi multi-produk, cuma escrow_product milik produk pertama yang
-- kepakai, sisanya diabaikan. Ini tidak konsisten begitu Escrow Fee Config
-- (bagdja-payment-service) mulai diisi per-produk.
--
-- Kolom ini jadi satu-satunya Escrow Product per website tenant — dipakai
-- untuk SEMUA produk website itu saat checkout. Auto-provision (nama =
-- nama website) kalau masih kosong, tidak ada fallback/default bersama
-- lintas website (lihat plan/website-builder/cart-and-implementation-payment-escrow.md).
--
-- Data lama di `website_products.metadata.escrow_product_id` dibiarkan
-- (tidak dipakai lagi, dibersihkan manual lewat DB editor kalau perlu).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS escrow_product_id uuid NULL;
