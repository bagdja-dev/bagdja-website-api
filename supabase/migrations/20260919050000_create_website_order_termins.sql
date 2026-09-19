-- fulfillment-praorder-plan.md §2.4/§2.4.1 — Termin 2..N (dan Tagihan
-- Tambahan ad-hoc) untuk 1 order yang sudah checkout. Termin 1 (DP) TIDAK
-- masuk sini — langsung jadi total_amount order/transaksi pertama seperti
-- checkout normal. Tabel ini murni data pendukung timeline Pascaorder
-- (disisipkan lewat anchor_step_name), bukan halaman kerja sendiri.

CREATE TABLE IF NOT EXISTS website_order_termins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  source_order_id UUID NOT NULL REFERENCES website_orders(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  label VARCHAR NOT NULL,
  amount NUMERIC NOT NULL,
  anchor_step_name VARCHAR NULL,
  status VARCHAR NOT NULL DEFAULT 'SCHEDULED',
  transaction_id UUID NULL REFERENCES website_transactions(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_order_termins_source_order_id
  ON website_order_termins (source_order_id);

CREATE INDEX IF NOT EXISTS idx_website_order_termins_website_id
  ON website_order_termins (website_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_order_termins_status_check'
  ) THEN
    ALTER TABLE website_order_termins
      ADD CONSTRAINT website_order_termins_status_check
      CHECK (status IN ('SCHEDULED', 'ISSUED', 'PAID', 'CANCELLED'));
  END IF;
END $$;
