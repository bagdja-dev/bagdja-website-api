-- Lokasi pilihan gathering: alamat lengkap + tautan Google Maps (opsional).
-- Plan: plan/website-builder/gathering-option-location-plan.md.
-- `venue_location` tetap dipakai sebagai nama tempat.

ALTER TABLE website_event_product_options
  ADD COLUMN IF NOT EXISTS venue_address text NULL,
  ADD COLUMN IF NOT EXISTS venue_map_url text NULL;

ALTER TABLE website_event_product_options
  DROP CONSTRAINT IF EXISTS ck_website_event_product_options_venue_address_length,
  ADD CONSTRAINT ck_website_event_product_options_venue_address_length
    CHECK (venue_address IS NULL OR char_length(venue_address) <= 500),
  DROP CONSTRAINT IF EXISTS ck_website_event_product_options_venue_map_url_https,
  ADD CONSTRAINT ck_website_event_product_options_venue_map_url_https
    CHECK (venue_map_url IS NULL OR (venue_map_url LIKE 'https://%' AND char_length(venue_map_url) <= 1000));

COMMENT ON COLUMN website_event_product_options.venue_address IS 'Alamat lengkap lokasi pilihan gathering.';
COMMENT ON COLUMN website_event_product_options.venue_map_url IS 'Tautan Google Maps lokasi pilihan gathering (https).';
