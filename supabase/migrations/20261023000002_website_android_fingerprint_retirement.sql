ALTER TABLE website_android_apps
  ADD COLUMN IF NOT EXISTS retired_signing_cert_sha256 TEXT[] NOT NULL DEFAULT '{}';
