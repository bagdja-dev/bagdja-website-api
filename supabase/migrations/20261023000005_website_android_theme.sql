-- Tampilan aplikasi Android (TWA): warna status bar, splash, navigation bar, dan mode tampilan.
-- Dikirim ke TWA builder sebagai payload.theme + payload.displayMode (kontrak sama dengan Bookpedia).
-- navigation_bar_color NULL = mengikuti splash_color; navigation_bar_divider_color NULL = tanpa garis pemisah.
ALTER TABLE website_android_apps
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) NOT NULL DEFAULT '#7C3AED',
  ADD COLUMN IF NOT EXISTS splash_color VARCHAR(7) NOT NULL DEFAULT '#0F172A',
  ADD COLUMN IF NOT EXISTS navigation_bar_color VARCHAR(7),
  ADD COLUMN IF NOT EXISTS navigation_bar_divider_color VARCHAR(7),
  ADD COLUMN IF NOT EXISTS display_mode VARCHAR(32) NOT NULL DEFAULT 'standalone';

ALTER TABLE website_android_apps
  DROP CONSTRAINT IF EXISTS website_android_apps_display_mode_check;
ALTER TABLE website_android_apps
  ADD CONSTRAINT website_android_apps_display_mode_check
  CHECK (display_mode IN ('standalone', 'fullscreen', 'fullscreen-sticky'));
