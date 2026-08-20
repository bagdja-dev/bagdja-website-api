-- ═══════════════════════════════════════════════════════════
-- website_transactions + website_transaction_items — W2.8
-- (plan/website-builder/cart-and-implementation-payment-escrow.md)
--
-- Pemisahan cart vs transaksi:
-- - website_orders = CART line (PENDING/CANCELLED). Order yang sudah
--   di-checkout punya `transaction_id` → TIDAK muncul di cart.
-- - website_transactions = 1 checkout: info pembeli (nama/alamat/HP), kurir,
--   total, payment_mode, STATUS transaksi, escrow_id, payment_request_id,
--   checkout_url. Escrow terikat ke TRANSACTION (1 transaksi = 1 escrow).
-- - website_transaction_items = item transaksi: link transaction_id +
--   order_id (item = id order) + snapshot harga saat checkout.
--
-- Status transaction: PENDING_PAYMENT/HELD/COMPLETED/REFUNDED/CLOSED/DISPUTED
-- (vocabulary sama dgn EscrowStatus payment-service) + CANCELLED (gagal).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS website_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL,
  buyer_identifier VARCHAR,
  recipient_name VARCHAR,
  phone VARCHAR,
  address TEXT,
  city VARCHAR,
  district VARCHAR,
  postal_code VARCHAR,
  courier VARCHAR,
  total_amount NUMERIC NOT NULL,
  currency VARCHAR NOT NULL DEFAULT 'IDR',
  payment_mode VARCHAR NOT NULL,
  payment_request_id UUID,
  escrow_id UUID,
  checkout_url TEXT,
  status VARCHAR NOT NULL DEFAULT 'PENDING_PAYMENT',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_transactions_website_id ON website_transactions(website_id);
CREATE INDEX IF NOT EXISTS idx_website_transactions_buyer_user_id ON website_transactions(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_website_transactions_escrow_id ON website_transactions(escrow_id);
CREATE INDEX IF NOT EXISTS idx_website_transactions_status ON website_transactions(status);

DROP TRIGGER IF EXISTS update_website_transactions_updated_at ON website_transactions;
CREATE TRIGGER update_website_transactions_updated_at
  BEFORE UPDATE ON website_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS website_transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES website_transactions(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES website_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES website_products(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_website_transaction_items_transaction_id ON website_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_website_transaction_items_order_id ON website_transaction_items(order_id);

-- Cart = order PENDING yang belum di-claim transaksi.
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS transaction_id UUID;
CREATE INDEX IF NOT EXISTS idx_website_orders_transaction_id ON website_orders(transaction_id);
