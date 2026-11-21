ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);

UPDATE website_pages
SET name = COALESCE(NULLIF(BTRIM(name), ''), title, slug)
WHERE name IS NULL OR BTRIM(name) = '';

ALTER TABLE website_pages
  ALTER COLUMN name SET NOT NULL;
