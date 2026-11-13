ALTER TABLE website_chat_threads
  ADD COLUMN IF NOT EXISTS transaction_id UUID NULL
  REFERENCES website_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_transaction_id
  ON website_chat_threads (transaction_id);
