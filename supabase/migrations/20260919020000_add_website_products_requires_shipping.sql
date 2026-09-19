-- fulfillment-praorder-plan.md §2.6/§0.1 (Q10) — sinyal independen "perlu
-- ongkir atau tidak", terpisah dari `type` produk maupun status vendor-routed.
-- Default TRUE: aman untuk semua produk fisik existing (perilaku ongkir
-- identik seperti sekarang). Produk BARU dengan type service/digital yang
-- tidak eksplisit set field ini akan di-default FALSE oleh ProductsService
-- saat create (bukan di level DB, karena default DB tidak bisa lihat kolom
-- lain seperti `type`).
ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS requires_shipping BOOLEAN NOT NULL DEFAULT true;
