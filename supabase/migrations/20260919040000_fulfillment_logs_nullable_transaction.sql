-- fulfillment-praorder-plan.md Fase 1/2 — step Praorder ditulis SEBELUM ada
-- transaksi (order masih PENDING, transaction_id belum ada sama sekali).
-- website_transaction_fulfillment_logs sengaja di-reuse sebagai satu-satunya
-- log progress (bukan tabel baru) — tapi transaction_id-nya wajib NOT NULL
-- sebelumnya, jadi step Praorder tidak bisa dicatat. Dilonggarkan jadi
-- nullable; query existing sudah selalu filter by order_id (bukan
-- transaction_id), jadi tidak ada perilaku lama yang berubah.
ALTER TABLE website_transaction_fulfillment_logs
  ALTER COLUMN transaction_id DROP NOT NULL;
