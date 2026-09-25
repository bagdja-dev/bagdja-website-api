DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'website_chat_threads' AND column_name = 'channel_type'
  ) THEN
    ALTER TABLE website_chat_threads
      DROP CONSTRAINT IF EXISTS website_chat_threads_channel_type_check;

    ALTER TABLE website_chat_threads
      ADD CONSTRAINT website_chat_threads_channel_type_check
      CHECK (channel_type IN ('product', 'support', 'order'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_channel_type
  ON website_chat_threads (channel_type);
