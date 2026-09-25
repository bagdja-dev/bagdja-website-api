ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS notification_sound_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS notification_sound_url VARCHAR(500);
