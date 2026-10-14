-- ═══════════════════════════════════════════════════════════
-- Gathering — perbaiki status checkout seat peserta (2026-10-15)
--
-- Dua bug lama membuat cancel-checkout initiator ditolak
-- ("Only a participant seat with an issued, pending checkout can be cancelled"):
--
-- 1. `syncGatheringTransaction` menyimpan status escrow mentah (`PENDING`)
--    ke `website_transactions.status`, padahal vocabulary transaksi adalah
--    `PENDING_PAYMENT`. Baris `PENDING` juga tidak pernah di-sync lagi.
-- 2. `website_event_registrations.payment_status` tidak pernah ditulis
--    `PENDING_PAYMENT` saat peserta checkout — tetap `UNPAID`.
--
-- Kode sudah diperbaiki (normalizeEscrowStatus + sinkron payment_status di
-- TransactionsService). Script ini menormalkan data yang sudah terlanjur
-- tersimpan. Idempoten — aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. Status transaksi escrow mentah → vocabulary transaksi.
UPDATE website_transactions
SET status = 'PENDING_PAYMENT'
WHERE status = 'PENDING';

-- 2. Seat yang order-nya sedang dalam checkout belum dibayar → PENDING_PAYMENT.
UPDATE website_event_registrations r
SET payment_status = 'PENDING_PAYMENT'
FROM website_orders o
JOIN website_transactions t ON t.id = o.transaction_id
WHERE o.id = r.order_id
  AND r.payment_status = 'UNPAID'
  AND t.status = 'PENDING_PAYMENT';

COMMIT;
