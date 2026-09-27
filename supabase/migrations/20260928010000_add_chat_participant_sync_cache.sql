ALTER TABLE website_chat_threads
  ADD COLUMN IF NOT EXISTS chat_participant_admin_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;