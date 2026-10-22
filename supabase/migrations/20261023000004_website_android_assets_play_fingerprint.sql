ALTER TABLE website_android_apps
  ADD COLUMN IF NOT EXISTS icon_storage_file_id UUID,
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS splash_storage_file_id UUID,
  ADD COLUMN IF NOT EXISTS splash_image_url TEXT,
  ADD COLUMN IF NOT EXISTS play_store_signing_cert_sha256 TEXT[] NOT NULL DEFAULT '{}';
