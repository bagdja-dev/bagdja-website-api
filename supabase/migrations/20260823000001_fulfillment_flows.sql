-- ═══════════════════════════════════════════════════════════
-- Order Handling Phase 3 — Fulfillment Flow
-- (plan/website-builder/order-hanlde-plan.md §3.2)
--
-- Memisahkan status BARANG (fulfillment) dari status UANG (escrow, tidak
-- disentuh migration ini). "Flow" = SOP pengiriman custom per produk,
-- didesain sendiri oleh seller — bukan hardcoded oleh sistem.
--
-- Desain kunci (lihat dokumen §3.0/§3.0.1 untuk detail):
-- - fulfillment_flows/fulfillment_flow_steps = TEMPLATE (definisi), dipakai
--   ulang lintas produk dalam 1 website.
-- - Grouping per Flow dalam 1 transaksi murni dihitung on-the-fly di
--   aplikasi (join order.product.fulfillment_flow_id) — TIDAK ADA tabel
--   groups tersendiri.
-- - website_transaction_fulfillment_logs = SATU-SATUNYA sumber kebenaran
--   progress, dicatat per (transaction_id, order_id) langsung — step_name
--   di sini SNAPSHOT teks (bukan FK ke fulfillment_flow_steps.id) supaya
--   catatan historis independen dari definisi flow yang bisa diedit nanti.
-- - release_percentage/guaranty_days per step menghubungkan progress
--   fulfillment ke pelepasan dana bertahap lewat payment-service
--   `release-partial` (plan/payment-service/escrow-milestone-decision.md
--   keputusan #19) — TIDAK ADA perubahan di payment-service untuk ini.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fulfillment_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_flows_website_id ON fulfillment_flows(website_id);

DROP TRIGGER IF EXISTS update_fulfillment_flows_updated_at ON fulfillment_flows;
CREATE TRIGGER update_fulfillment_flows_updated_at
  BEFORE UPDATE ON fulfillment_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS fulfillment_flow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES fulfillment_flows(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  status_name VARCHAR NOT NULL,
  description TEXT,
  process_day INT,
  form_schema JSONB,
  -- §3.0.1 — pelepasan dana bertahap (opsional per step)
  release_percentage NUMERIC CHECK (release_percentage IS NULL OR (release_percentage > 0 AND release_percentage <= 100)),
  guaranty_days INT CHECK (guaranty_days IS NULL OR guaranty_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_flow_steps_flow_id ON fulfillment_flow_steps(flow_id);

DROP TRIGGER IF EXISTS update_fulfillment_flow_steps_updated_at ON fulfillment_flow_steps;
CREATE TRIGGER update_fulfillment_flow_steps_updated_at
  BEFORE UPDATE ON fulfillment_flow_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Assign flow ke produk — nullable, null = tidak butuh tracking (mis. produk digital).
ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS fulfillment_flow_id UUID NULL REFERENCES fulfillment_flows(id) ON DELETE SET NULL;

-- Agregat di level transaksi — DELIVERED kalau semua order_id berflow dalam
-- transaksi itu sudah punya log event_type='DELIVERED'.
ALTER TABLE website_transactions
  ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR NOT NULL DEFAULT 'PROCESSING';

CREATE TABLE IF NOT EXISTS website_transaction_fulfillment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES website_transactions(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES website_orders(id) ON DELETE CASCADE,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('STEP_COMPLETED', 'RELEASE_APPROVED', 'STEP_DISPUTED', 'DELIVERED')),
  step_name VARCHAR, -- snapshot, nullable untuk event DELIVERED
  form_data JSONB, -- diisi saat event_type = STEP_COMPLETED
  release_amount NUMERIC, -- diisi saat event_type = RELEASE_APPROVED
  release_approved_by VARCHAR CHECK (release_approved_by IS NULL OR release_approved_by IN ('buyer', 'seller_guaranty')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_logs_transaction_id ON website_transaction_fulfillment_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_logs_order_id ON website_transaction_fulfillment_logs(order_id);
