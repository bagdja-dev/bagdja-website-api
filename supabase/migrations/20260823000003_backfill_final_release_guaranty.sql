-- ═══════════════════════════════════════════════════════════
-- Order Handling Phase 3 §3.0.2 — Standarisasi Masa Garansi Konfirmasi
-- Penerimaan jadi 3 hari (2026-08-23)
--
-- Sebelumnya `final_release_guaranty_days` defaultnya NULL (opt-in —
-- force-complete dinonaktifkan sampai seller mengisi manual). Buyer sering
-- lupa klik "Selesai — Terima Barang", jadi kebijakan diubah jadi opt-out:
-- standar 3 hari untuk semua produk, seller tinggal ubah/kosongkan manual
-- kalau mau nonaktifkan force-complete untuk produk tertentu.
--
-- - Backfill produk EXISTING yang belum diisi (NULL) → 3 hari.
-- - DEFAULT kolom diubah jadi 3 (untuk insert yang tidak eksplisit isi
--   kolom ini, mis. lewat integrasi lain di luar bagdja-website-admin).
--   Insert baru dari bagdja-website-admin tetap kirim nilai eksplisit
--   (form sudah di-default 3 di UI, lihat products/page.tsx), tapi DEFAULT
--   ini jaga-jaga.
-- ═══════════════════════════════════════════════════════════

UPDATE website_products
SET final_release_guaranty_days = 3
WHERE final_release_guaranty_days IS NULL;

ALTER TABLE website_products
  ALTER COLUMN final_release_guaranty_days SET DEFAULT 3;
