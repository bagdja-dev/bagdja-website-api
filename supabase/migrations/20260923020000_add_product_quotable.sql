-- Product quotation mode.
ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS quotable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE website_orders
  ADD COLUMN IF NOT EXISTS quoted_total_amount NUMERIC;
