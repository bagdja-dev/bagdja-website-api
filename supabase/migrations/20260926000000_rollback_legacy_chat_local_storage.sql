-- Rollback local website chat storage: canonical data lives in bagdja-chat-service.
-- This migration removes message storage and preserves website thread mapping rows
-- with a canonical `topic_id` pointing to the Chat Service topic.

DROP TABLE IF EXISTS website_chat_messages;

ALTER TABLE website_chat_threads
  ADD COLUMN IF NOT EXISTS topic_id UUID;

UPDATE website_chat_threads
SET topic_id = id
WHERE topic_id IS NULL;

ALTER TABLE website_chat_threads
  ALTER COLUMN topic_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_website_chat_threads_topic_id
  ON website_chat_threads (topic_id);

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_topic_id
  ON website_chat_threads (topic_id);
