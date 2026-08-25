-- ═══════════════════════════════════════════════════════════
-- Kurir aktif pindah dari level Website ke level Lokasi
-- (plan/shipping-service/overview.md §9 Fase 2 lanjutan — Fase 3)
--
-- Sekarang Website Builder mendukung >1 lokasi asal pengiriman per website,
-- jadi cakupan kurir yang relevan juga per-lokasi (tiap toko bisa beda kurir),
-- bukan lagi satu daftar untuk seluruh website.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE website_locations
  ADD COLUMN IF NOT EXISTS active_couriers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: salin active_couriers website ke lokasi is_primary-nya (kalau ada),
-- supaya pengaturan yang sudah diisi tenant tidak hilang begitu saja.
UPDATE website_locations wl
SET active_couriers = w.active_couriers
FROM websites w
WHERE wl.website_id = w.id
  AND wl.is_primary = true
  AND w.active_couriers != '[]'::jsonb;

ALTER TABLE websites
  DROP COLUMN IF EXISTS active_couriers;
