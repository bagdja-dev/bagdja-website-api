ALTER TABLE website_categories
  ADD COLUMN IF NOT EXISTS identity_name VARCHAR(255);

UPDATE website_categories
SET identity_name = label
WHERE identity_name IS NULL OR btrim(identity_name) = '';

ALTER TABLE website_categories
  ALTER COLUMN identity_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_categories_identity_name
  ON website_categories(website_id, identity_name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_categories_id_website
  ON website_categories(id, website_id);

CREATE TABLE IF NOT EXISTS website_category_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL,
  category_id UUID NOT NULL,
  locale VARCHAR(10) NOT NULL,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, locale),
  FOREIGN KEY (category_id, website_id)
    REFERENCES website_categories(id, website_id) ON DELETE CASCADE,
  FOREIGN KEY (website_id, locale)
    REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_website_category_translations_website_locale
  ON website_category_translations(website_id, locale);
