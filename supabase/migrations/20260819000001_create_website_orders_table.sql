-- ═══════════════════════════════════════════════════════════
-- website_orders — W2 (plan/website-builder/cart-and-implementation-payment-escrow.md)
--
-- Order = 1 checkout dari buyer login untuk 1 produk (MVP: 1 order = 1
-- produk). `escrow_id` 1:1 dengan order — escrow terikat ke ORDER, bukan
-- ke produk (produk sendiri terikat ke `escrow_product_id`, template yang
-- reusable, disimpan di website_products.metadata).
--
-- `status` sengaja pakai vocabulary yang SAMA dengan EscrowStatus di
-- payment-service (PENDING/HELD/COMPLETED/REFUNDED/CLOSED/DISPUTED) supaya
-- sinkronisasi (pull/polling, PH-6) tinggal copy status tanpa mapping
-- table. `CANCELLED` khusus state lokal sebelum/saat gagal checkout.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS website_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES website_products(id),
  buyer_user_id UUID NOT NULL,
  buyer_identifier VARCHAR,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  currency VARCHAR NOT NULL DEFAULT 'IDR',
  payment_mode VARCHAR NOT NULL,
  payment_request_id UUID,
  escrow_id UUID,
  checkout_url TEXT,
  status VARCHAR NOT NULL DEFAULT 'PENDING',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_orders_website_id ON website_orders(website_id);
CREATE INDEX IF NOT EXISTS idx_website_orders_buyer_user_id ON website_orders(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_website_orders_escrow_id ON website_orders(escrow_id);

DROP TRIGGER IF EXISTS update_website_orders_updated_at ON website_orders;
CREATE TRIGGER update_website_orders_updated_at
  BEFORE UPDATE ON website_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
