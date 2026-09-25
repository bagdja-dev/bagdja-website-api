CREATE TABLE IF NOT EXISTS website_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  channel_type VARCHAR NOT NULL,
  channel_label VARCHAR NULL,
  product_id UUID NULL REFERENCES website_products(id) ON DELETE SET NULL,
  order_id UUID NULL REFERENCES website_orders(id) ON DELETE SET NULL,
  order_item_id UUID NULL,
  customer_user_id UUID NOT NULL,
  participant_admin_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_admin_user_id UUID NULL,
  status VARCHAR NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ NULL,
  unread_count_by_admin INT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES website_chat_threads(id) ON DELETE CASCADE,
  author_type VARCHAR NOT NULL DEFAULT 'customer',
  author_user_id UUID NOT NULL,
  author_name VARCHAR NULL,
  body TEXT NOT NULL,
  metadata JSONB NULL,
  parent_message_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_website_id
  ON website_chat_threads (website_id);

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_customer_user_id
  ON website_chat_threads (customer_user_id);

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_channel_type
  ON website_chat_threads (channel_type);

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_status
  ON website_chat_threads (status);

CREATE INDEX IF NOT EXISTS idx_website_chat_messages_thread_id
  ON website_chat_messages (thread_id);

CREATE INDEX IF NOT EXISTS idx_website_chat_messages_author_user_id
  ON website_chat_messages (author_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_chat_threads_channel_type_check'
  ) THEN
    ALTER TABLE website_chat_threads
      ADD CONSTRAINT website_chat_threads_channel_type_check
      CHECK (channel_type IN ('product', 'support', 'order', 'general'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_chat_threads_status_check'
  ) THEN
    ALTER TABLE website_chat_threads
      ADD CONSTRAINT website_chat_threads_status_check
      CHECK (status IN ('open', 'waiting', 'resolved', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_chat_messages_author_type_check'
  ) THEN
    ALTER TABLE website_chat_messages
      ADD CONSTRAINT website_chat_messages_author_type_check
      CHECK (author_type IN ('customer', 'admin', 'system'));
  END IF;
END $$;
