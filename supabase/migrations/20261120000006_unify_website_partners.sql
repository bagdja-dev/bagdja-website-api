CREATE TABLE IF NOT EXISTS website_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(1000),
  website_url VARCHAR(1000),
  contact_whatsapp VARCHAR(50),
  notes TEXT,
  is_client BOOLEAN NOT NULL DEFAULT false,
  is_provider BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_website_partners_has_role CHECK (is_client OR is_provider),
  CONSTRAINT chk_website_partners_status CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_website_partners_website_roles
  ON website_partners (website_id, is_client, is_provider, is_active, sort_order);

INSERT INTO website_partners (
  id, website_id, name, contact_whatsapp, notes, is_provider, is_active, status, created_at, updated_at
)
SELECT id, website_id, name, contact_whatsapp, notes, true, status = 'active', status, created_at, updated_at
FROM website_vendors
ON CONFLICT (id) DO NOTHING;

INSERT INTO website_partners (
  id, website_id, name, logo_url, website_url, is_client, is_public, is_active, status, sort_order, created_at, updated_at
)
SELECT
  client.id,
  client.website_id,
  COALESCE(translation.name, 'Client'),
  client.logo_url,
  client.website_url,
  true,
  true,
  client.is_active,
  CASE WHEN client.is_active THEN 'active' ELSE 'inactive' END,
  client.sort_order,
  client.created_at,
  client.updated_at
FROM website_clients AS client
LEFT JOIN LATERAL (
  SELECT item.name
  FROM website_client_translations AS item
  WHERE item.client_id = client.id
  ORDER BY (item.locale = 'id') DESC, item.created_at ASC
  LIMIT 1
) AS translation ON true
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS website_partner_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES website_partners(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, locale),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

INSERT INTO website_partner_translations (website_id, partner_id, locale, name, description, created_at, updated_at)
SELECT website_id, client_id, locale, name, description, created_at, updated_at
FROM website_client_translations
ON CONFLICT (partner_id, locale) DO NOTHING;

INSERT INTO website_partner_translations (website_id, partner_id, locale, name, description)
SELECT website_id, id, 'id', name, notes
FROM website_partners
WHERE is_provider
  AND NOT EXISTS (
    SELECT 1 FROM website_partner_translations AS translation
    WHERE translation.partner_id = website_partners.id AND translation.locale = 'id'
  );

CREATE TABLE IF NOT EXISTS website_partner_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, slug),
  UNIQUE (id, website_id)
);

CREATE TABLE IF NOT EXISTS website_partner_category_assignments (
  partner_id UUID NOT NULL REFERENCES website_partners(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES website_partner_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, category_id)
);

CREATE TABLE IF NOT EXISTS website_partner_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES website_partners(id) ON DELETE CASCADE,
  bagdja_account_id UUID NOT NULL,
  role VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, bagdja_account_id, role),
  CONSTRAINT chk_website_partner_accounts_status CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_website_partner_accounts_account
  ON website_partner_accounts (bagdja_account_id, status);

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid IN (
        'website_vendor_locations'::regclass,
        'website_orders'::regclass,
        'website_portfolio_projects'::regclass
      )
      AND confrelid IN (
        'website_vendors'::regclass,
        'website_clients'::regclass
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE website_vendor_locations
  ADD CONSTRAINT fk_website_vendor_locations_partner
  FOREIGN KEY (vendor_id) REFERENCES website_partners(id) ON DELETE CASCADE;

ALTER TABLE website_orders
  ADD CONSTRAINT fk_website_orders_provider_partner
  FOREIGN KEY (vendor_id) REFERENCES website_partners(id) ON DELETE SET NULL;

ALTER TABLE website_portfolio_projects
  ADD CONSTRAINT fk_website_portfolio_projects_client_partner
  FOREIGN KEY (client_id) REFERENCES website_partners(id) ON DELETE SET NULL;
