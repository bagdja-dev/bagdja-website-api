CREATE TABLE IF NOT EXISTS website_android_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL UNIQUE REFERENCES websites(id) ON DELETE CASCADE,
  app_name VARCHAR(50) NOT NULL,
  package_name VARCHAR(255) NOT NULL UNIQUE,
  version_name VARCHAR(64) NOT NULL DEFAULT '1.0.0',
  version_code INTEGER NOT NULL DEFAULT 1 CHECK (version_code > 0),
  package_name_locked BOOLEAN NOT NULL DEFAULT FALSE,
  keystore_storage_file_id UUID,
  keystore_alias VARCHAR(255),
  store_password_encrypted TEXT,
  key_password_encrypted TEXT,
  release_signing_cert_sha256 TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT website_android_apps_keystore_fields_complete CHECK (
    (keystore_storage_file_id IS NULL AND keystore_alias IS NULL
      AND store_password_encrypted IS NULL AND key_password_encrypted IS NULL)
    OR
    (keystore_storage_file_id IS NOT NULL AND keystore_alias IS NOT NULL
      AND store_password_encrypted IS NOT NULL AND key_password_encrypted IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_website_android_apps_keystore_file
  ON website_android_apps(keystore_storage_file_id)
  WHERE keystore_storage_file_id IS NOT NULL;

COMMENT ON TABLE website_android_apps IS
  'Tenant-owned Android/TWA app configuration. Keystore files are private Storage objects; passwords are AES-256-GCM encrypted by Website API.';
