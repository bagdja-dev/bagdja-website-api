-- ═══════════════════════════════════════════════════════════
-- Integrasi bagdja-shipping-service — kurir aktif per website +
-- dimensi produk (susulan migration 20260825130000)
--
-- - websites.active_couriers: daftar kode kurir yang aktif untuk website
--   ini (mis. ['jne','sicepat']) — dipakai sebagai filter courier_code
--   saat panggil bagdja-shipping-service. Kosong = pakai default
--   shipping-service (semua kurir yang didukung provider aktif).
-- - website_products.length_cm/width_cm/height_cm: dimensi kemasan (cm),
--   dipakai ShippingController untuk hitung berat volumetrik
--   ((p×l×t)/6000, dalam kg) — kurir menagih berdasarkan berat AKTUAL atau
--   volumetrik, mana yang lebih besar. RajaOngkir (Fase 0) cuma terima
--   parameter weight, tidak ada parameter dimensi terpisah, jadi konversi
--   ke "berat efektif" dilakukan di website-api, bukan dikirim mentah.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS active_couriers JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS length_cm INT NULL CHECK (length_cm IS NULL OR length_cm > 0),
  ADD COLUMN IF NOT EXISTS width_cm INT NULL CHECK (width_cm IS NULL OR width_cm > 0),
  ADD COLUMN IF NOT EXISTS height_cm INT NULL CHECK (height_cm IS NULL OR height_cm > 0);
