-- Backfill gathering plans created before website_event_groups.order_id was
-- introduced. Preserve existing plan links by using the group UUID as the
-- order UUID when it is available; otherwise assign a new order UUID.
-- Safe to rerun: only groups without an order are changed.

BEGIN;

-- Recover plan orders that were already written with gathering metadata but
-- whose group link was not persisted.
UPDATE website_event_groups AS event_group
SET order_id = (
  SELECT plan_order.id
  FROM website_orders AS plan_order
  WHERE plan_order.website_id = event_group.website_id
    AND plan_order.product_id = event_group.product_id
    AND plan_order.buyer_user_id = event_group.initiator_user_id
    AND plan_order.metadata #>> '{gathering,role}' = 'initiator'
    AND plan_order.metadata #>> '{gathering,group_id}' = event_group.id::TEXT
  ORDER BY plan_order.created_at, plan_order.id
  LIMIT 1
)
WHERE event_group.order_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM website_orders AS plan_order
    WHERE plan_order.website_id = event_group.website_id
      AND plan_order.product_id = event_group.product_id
      AND plan_order.buyer_user_id = event_group.initiator_user_id
      AND plan_order.metadata #>> '{gathering,role}' = 'initiator'
      AND plan_order.metadata #>> '{gathering,group_id}' = event_group.id::TEXT
  );

WITH legacy_plans AS MATERIALIZED (
  SELECT
    event_group.id AS group_id,
    event_group.website_id,
    event_group.product_id,
    event_group.initiator_user_id,
    event_group.status AS group_status,
    event_group.created_at,
    event_group.updated_at,
    occurrence.id AS occurrence_id,
    occurrence.price_per_seat,
    occurrence.currency,
    product.payment_meta,
    users.email,
    users.username
  FROM website_event_groups AS event_group
  JOIN website_gathering_occurrences AS occurrence
    ON occurrence.parent_order_id = event_group.id
   AND occurrence.website_id = event_group.website_id
  JOIN website_products AS product
    ON product.id = event_group.product_id
   AND product.website_id = event_group.website_id
   AND product.type = 'gathering'
  LEFT JOIN users
    ON users.id = event_group.initiator_user_id
  WHERE event_group.order_id IS NULL
  FOR UPDATE OF event_group
),
inserted_plan_orders AS (
  INSERT INTO website_orders (
    id,
    website_id,
    product_id,
    buyer_user_id,
    buyer_identifier,
    quantity,
    unit_price,
    total_amount,
    currency,
    payment_mode,
    status,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM website_orders AS existing_order WHERE existing_order.id = legacy_plans.group_id
      ) THEN legacy_plans.group_id
      ELSE gen_random_uuid()
    END,
    legacy_plans.website_id,
    legacy_plans.product_id,
    legacy_plans.initiator_user_id,
    COALESCE(NULLIF(legacy_plans.email, ''), NULLIF(legacy_plans.username, '')),
    0,
    legacy_plans.price_per_seat,
    0,
    legacy_plans.currency,
    COALESCE(
      (
        SELECT payment_entry.value->>'payment_mode'
        FROM jsonb_array_elements(COALESCE(legacy_plans.payment_meta, '[]'::JSONB))
          WITH ORDINALITY AS payment_entry(value, position)
        WHERE payment_entry.value->>'payment_mode' IN ('ESCROW', 'ADD_TO_CART')
        ORDER BY payment_entry.position
        LIMIT 1
      ),
      'ESCROW'
    ),
    CASE WHEN legacy_plans.group_status = 'CANCELLED' THEN 'CANCELLED' ELSE 'PENDING' END,
    jsonb_build_object(
      'source', 'gathering_plan',
      'gathering', jsonb_build_object(
        'role', 'initiator',
        'group_id', legacy_plans.group_id,
        'occurrence_id', legacy_plans.occurrence_id
      )
    ),
    legacy_plans.created_at,
    legacy_plans.updated_at
  FROM legacy_plans
  RETURNING id, metadata #>> '{gathering,group_id}' AS group_id
)
UPDATE website_event_groups AS event_group
SET order_id = inserted_plan_orders.id
FROM inserted_plan_orders
WHERE event_group.id = inserted_plan_orders.group_id::UUID
  AND event_group.order_id IS NULL;

COMMIT;
