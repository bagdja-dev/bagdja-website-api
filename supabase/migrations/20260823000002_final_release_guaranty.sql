-- ═══════════════════════════════════════════════════════════
-- Order Handling Phase 3 §3.0.2 — Masa Garansi Konfirmasi Penerimaan
-- (plan/website-builder/order-hanlde-plan.md §3.0.2)
--
-- Sebelum ini, kalau buyer tidak pernah klik "Selesai — Terima Barang",
-- dana sisa escrow tertahan HELD selamanya tanpa jalan keluar untuk
-- seller. Tambahan ini kasih seller "Force Complete" per transaksi,
-- tapi HANYA kalau SEMUA produk dalam transaksi itu sudah diatur masa
-- garansinya (final_release_guaranty_days) — kalau ada satu saja produk
-- yang belum diatur, force-complete tidak tersedia (safety default).
--
-- `held_at` = baseline waktu hitung mundur masa garansi (kapan transaksi
-- pertama kali HELD) — diisi otomatis oleh `syncStatusFromEscrow` saat
-- transisi status ke HELD, BUKAN backfill historis (transaksi lama akan
-- fallback ke `created_at` di aplikasi, lihat transactions.service.ts).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS final_release_guaranty_days INT NULL
    CHECK (final_release_guaranty_days IS NULL OR final_release_guaranty_days > 0);

ALTER TABLE website_transactions
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ NULL;
