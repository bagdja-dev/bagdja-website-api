ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS direct_payment_product_id UUID NULL;