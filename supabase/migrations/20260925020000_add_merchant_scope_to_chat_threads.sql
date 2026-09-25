ALTER TABLE website_chat_threads
  ADD COLUMN IF NOT EXISTS merchant_id UUID;

DO $$
BEGIN
  UPDATE website_chat_threads
  SET merchant_id = (
    SELECT staff.user_id
    FROM tenant_staff staff
    WHERE staff.website_id = website_chat_threads.website_id
      AND staff.role = 'owner'
      AND staff.is_active = true
    ORDER BY staff.created_at ASC
    LIMIT 1
  )
  WHERE merchant_id IS NULL;
END $$;

ALTER TABLE website_chat_threads
  ALTER COLUMN merchant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_website_chat_threads_merchant_id
  ON website_chat_threads (merchant_id);
