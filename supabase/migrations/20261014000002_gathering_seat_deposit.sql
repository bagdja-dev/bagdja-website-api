ALTER TABLE website_event_product_options
  ADD COLUMN IF NOT EXISTS deposit_amount_per_seat NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE website_gathering_occurrences
  ADD COLUMN IF NOT EXISTS deposit_amount_per_seat NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_event_product_options_deposit_amount_per_seat_check'
  ) THEN
    ALTER TABLE website_event_product_options
      ADD CONSTRAINT website_event_product_options_deposit_amount_per_seat_check
      CHECK (deposit_amount_per_seat >= 0 AND deposit_amount_per_seat <= price_per_seat);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_gathering_occurrences_deposit_amount_per_seat_check'
  ) THEN
    ALTER TABLE website_gathering_occurrences
      ADD CONSTRAINT website_gathering_occurrences_deposit_amount_per_seat_check
      CHECK (deposit_amount_per_seat >= 0 AND deposit_amount_per_seat <= price_per_seat);
  END IF;
END $$;

-- Recover a previously stored product-level value when present; old products
-- without a configured deposit deliberately backfill to zero, never full price.
UPDATE website_event_product_options AS option
SET deposit_amount_per_seat = LEAST(
  option.price_per_seat,
  GREATEST(
    CASE
      WHEN product.metadata->>'deposit_amount_per_seat' ~ '^[0-9]+([.][0-9]+)?$'
        THEN (product.metadata->>'deposit_amount_per_seat')::NUMERIC
      ELSE 0
    END,
    0
  )
)
FROM website_products AS product
WHERE product.id = option.product_id
  AND option.deposit_amount_per_seat = 0;

UPDATE website_gathering_occurrences AS occurrence
SET deposit_amount_per_seat = LEAST(
  occurrence.price_per_seat,
  COALESCE((
    SELECT MIN(option.deposit_amount_per_seat)
    FROM website_event_product_options AS option
    WHERE option.website_id = occurrence.website_id
      AND option.product_id = occurrence.product_id
      AND option.is_active = true
  ), 0)
);

-- Snapshot the configured per-seat deposit onto existing participant seat orders.
UPDATE website_orders AS seat_order
SET metadata = jsonb_set(
  COALESCE(seat_order.metadata, '{}'::JSONB),
  '{gathering}',
  COALESCE(seat_order.metadata->'gathering', '{}'::JSONB)
    || jsonb_build_object('deposit_amount_per_seat', occurrence.deposit_amount_per_seat),
  true
)
FROM website_gathering_occurrences AS occurrence
WHERE seat_order.metadata #>> '{gathering,role}' = 'participant'
  AND seat_order.metadata #>> '{gathering,occurrence_id}' = occurrence.id::TEXT
  AND seat_order.website_id = occurrence.website_id;

-- Backfill a transaction-level snapshot for already-created collective escrows.
WITH gathering_deposits AS (
  SELECT
    item.transaction_id,
    seat_order.metadata #>> '{gathering,group_id}' AS group_id,
    MIN(occurrence.deposit_amount_per_seat) AS deposit_amount_per_seat,
    SUM(occurrence.deposit_amount_per_seat * item.quantity) AS deposit_amount_total
  FROM website_transaction_items AS item
  JOIN website_orders AS seat_order ON seat_order.id = item.order_id
  JOIN website_gathering_occurrences AS occurrence
    ON occurrence.id::TEXT = seat_order.metadata #>> '{gathering,occurrence_id}'
   AND occurrence.website_id = seat_order.website_id
  WHERE seat_order.metadata #>> '{gathering,role}' = 'participant'
  GROUP BY item.transaction_id, seat_order.metadata #>> '{gathering,group_id}'
), transaction_snapshots AS (
  SELECT
    transaction_id,
    jsonb_agg(jsonb_build_object(
      'group_id', group_id,
      'deposit_amount_per_seat', deposit_amount_per_seat,
      'deposit_amount_total', deposit_amount_total,
      'released_amount', 0
    )) AS plans
  FROM gathering_deposits
  GROUP BY transaction_id
)
UPDATE website_transactions AS transaction
SET metadata = COALESCE(transaction.metadata, '{}'::JSONB)
  || jsonb_build_object('gathering_deposit', jsonb_build_object('plans', snapshot.plans))
FROM transaction_snapshots AS snapshot
WHERE transaction.id = snapshot.transaction_id;
