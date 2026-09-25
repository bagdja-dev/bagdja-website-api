ALTER TABLE website_chat_threads
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
