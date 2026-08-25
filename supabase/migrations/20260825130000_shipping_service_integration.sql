-- ═══════════════════════════════════════════════════════════
-- Integrasi bagdja-shipping-service — Fase 1 Backend
-- (plan/website-builder/integration-check-shipping-plan.md §5/§6,
--  plan/shipping-service/overview.md §9 Fase 2)
--
-- website-api tidak lagi (akan tidak) memanggil RajaOngkir langsung —
-- semua cek ongkir/cari wilayah lewat bagdja-shipping-service. Tiga kolom
-- ini menyimpan input yang dibutuhkan sisi konsumen:
--   - website_locations.shipping_area_name: NAMA area asal (bukan ID
--     mentah) — keputusan final shipping-service/overview.md §6 isu #1
--     (opsi b: re-lookup by name ke shipping-service tiap hitung ongkir,
--     tanpa tabel mapping ID statis, supaya tidak invalid saat provider
--     ongkir diganti).
--   - website_products.weight_grams: berat produk (gram), opsional —
--     default 1000g diterapkan di level aplikasi (bukan default DB),
--     D2 dokumen di atas.
--   - website_transactions.shipping_cost: biaya ongkir, kolom TERPISAH
--     dari total_amount (D7) — breakdown subtotal vs ongkir transparan.
--     Penyatuan ke total_amount baru di Fase 4 (belum di migration ini).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE website_locations
  ADD COLUMN IF NOT EXISTS shipping_area_name VARCHAR(255) NULL;

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS weight_grams INT NULL
    CHECK (weight_grams IS NULL OR weight_grams > 0);

ALTER TABLE website_transactions
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC NULL DEFAULT 0;
