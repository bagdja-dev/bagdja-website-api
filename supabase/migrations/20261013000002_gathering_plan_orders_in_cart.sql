-- ═══════════════════════════════════════════════════════════
-- Gathering masuk cart (plan/website-builder/event-registration-and-attendance-plan.md §0)
--
-- Rencana gathering = website_orders PENDING di cart initiator (order rencana,
-- tanpa seat, quantity 0, tidak pernah di-checkout) — pola sama dengan order
-- quotation. website_event_groups menempel ke order itu lewat order_id.
-- Seat peserta (Phase 3/4) = website_orders anak lewat parent_order_id.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE website_orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID
    REFERENCES website_orders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_website_orders_parent_order_id
  ON website_orders(parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- Nullable: plan yang dibuat sebelum migration ini belum punya order rencana.
ALTER TABLE website_event_groups
  ADD COLUMN IF NOT EXISTS order_id UUID
    REFERENCES website_orders(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_groups_order_id
  ON website_event_groups(order_id)
  WHERE order_id IS NOT NULL;
