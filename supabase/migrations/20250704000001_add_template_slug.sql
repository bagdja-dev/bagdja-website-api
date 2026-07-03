-- Tambah kolom slug ke website_templates (tidak ada di schema awal).
-- Idempotent: skip jika kolom sudah ada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'website_templates' AND column_name = 'slug'
  ) THEN
    ALTER TABLE website_templates ADD COLUMN slug VARCHAR(255);

    -- Isi slug dari name yang sudah ada (lowercase, spasi → dash)
    UPDATE website_templates
    SET slug = lower(replace(name, ' ', '-'))
    WHERE slug IS NULL;

    -- Set NOT NULL dan UNIQUE setelah diisi
    ALTER TABLE website_templates ALTER COLUMN slug SET NOT NULL;
    ALTER TABLE website_templates ADD CONSTRAINT uq_website_templates_slug UNIQUE (slug);
  END IF;
END $$;
