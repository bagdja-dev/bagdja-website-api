ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS identity_name VARCHAR(255);

UPDATE website_products
SET identity_name = name
WHERE identity_name IS NULL OR btrim(identity_name) = '';

ALTER TABLE website_products
  ALTER COLUMN identity_name SET NOT NULL;
