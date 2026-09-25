ALTER TABLE website_chat_threads
  ADD COLUMN IF NOT EXISTS last_admin_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_customer_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_last_admin_read_at
  ON website_chat_threads (website_id, last_admin_read_at);

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_last_customer_read_at
  ON website_chat_threads (website_id, customer_user_id, last_customer_read_at);
