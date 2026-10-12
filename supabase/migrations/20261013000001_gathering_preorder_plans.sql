CREATE UNIQUE INDEX IF NOT EXISTS website_products_website_id_id_uidx
  ON website_products (website_id, id);

CREATE TABLE IF NOT EXISTS website_event_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PREORDER',
  invite_policy VARCHAR(16) NOT NULL DEFAULT 'OPEN'
    CHECK (invite_policy IN ('OPEN', 'INVITE_ONLY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_website_event_groups_product
    FOREIGN KEY (website_id, product_id)
    REFERENCES website_products(website_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_website_event_groups_tenant_id_product
    UNIQUE (website_id, id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_website_event_groups_initiator
  ON website_event_groups(website_id, initiator_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS website_gathering_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL,
  product_id UUID NOT NULL,
  parent_order_id UUID NOT NULL UNIQUE,
  initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PREORDER'
    CHECK (status IN ('DRAFT', 'PREORDER', 'RSVP_OPEN', 'PAYMENT_OPEN', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  rsvp_open_at TIMESTAMPTZ,
  rsvp_close_at TIMESTAMPTZ,
  payment_deadline TIMESTAMPTZ,
  price_per_seat NUMERIC(12,2) NOT NULL CHECK (price_per_seat >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  min_attendees INTEGER NOT NULL DEFAULT 0 CHECK (min_attendees >= 0),
  max_attendees INTEGER NOT NULL CHECK (max_attendees > 0 AND min_attendees <= max_attendees),
  final_location TEXT,
  final_schedule TEXT,
  cancellation_policy_snapshot JSONB NOT NULL DEFAULT '{}',
  option_groups_snapshot JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_website_gathering_occurrences_parent
    FOREIGN KEY (website_id, parent_order_id, product_id)
    REFERENCES website_event_groups(website_id, id, product_id) ON DELETE CASCADE,
  CONSTRAINT uq_website_gathering_occurrences_tenant_id
    UNIQUE (website_id, id)
);

CREATE INDEX IF NOT EXISTS idx_website_gathering_occurrences_unscheduled
  ON website_gathering_occurrences(website_id, status, created_at DESC)
  WHERE final_schedule IS NULL;

DROP TRIGGER IF EXISTS update_website_event_groups_updated_at ON website_event_groups;
CREATE TRIGGER update_website_event_groups_updated_at
  BEFORE UPDATE ON website_event_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_website_gathering_occurrences_updated_at ON website_gathering_occurrences;
CREATE TRIGGER update_website_gathering_occurrences_updated_at
  BEFORE UPDATE ON website_gathering_occurrences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();