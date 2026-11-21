-- Phase 1: company profile localization foundation
-- Existing websites receive Indonesian (id) as the default language.

CREATE TABLE IF NOT EXISTS website_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  label VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, locale)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_website_languages_one_default
  ON website_languages(website_id)
  WHERE is_default;

INSERT INTO website_languages (website_id, locale, label, is_default, is_active, sort_order)
SELECT id, 'id', 'Indonesia', true, true, 0
FROM websites
WHERE NOT EXISTS (
  SELECT 1 FROM website_languages wl WHERE wl.website_id = websites.id
);

CREATE TABLE IF NOT EXISTS website_page_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  seo_image VARCHAR(1000),
  seo_no_index BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, locale),
  UNIQUE (website_id, locale, slug),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

INSERT INTO website_page_translations (
  website_id, page_id, locale, slug, title, content,
  seo_title, seo_description, seo_image, seo_no_index, is_published
)
SELECT
  p.website_id, p.id, 'id', p.slug, p.title, p.content,
  p.seo_title, p.seo_description, p.seo_image, p.seo_no_index, true
FROM website_pages p
WHERE NOT EXISTS (
  SELECT 1 FROM website_page_translations t
  WHERE t.page_id = p.id AND t.locale = 'id'
);

CREATE TABLE IF NOT EXISTS website_section_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES website_sections(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_id, locale),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

INSERT INTO website_section_translations (
  website_id, section_id, locale, content, is_published
)
SELECT
  p.website_id, s.id, 'id', s.content, true
FROM website_sections s
JOIN website_pages p ON p.id = s.page_id
WHERE NOT EXISTS (
  SELECT 1 FROM website_section_translations t
  WHERE t.section_id = s.id AND t.locale = 'id'
);

CREATE TABLE IF NOT EXISTS website_product_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES website_products(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  detail TEXT,
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  seo_image VARCHAR(1000),
  seo_no_index BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, locale),
  UNIQUE (website_id, locale, slug),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

INSERT INTO website_product_translations (
  website_id, product_id, locale, slug, name, description, detail,
  seo_title, seo_description, seo_image, seo_no_index, is_published
)
SELECT
  p.website_id, p.id, 'id', p.slug, p.name, p.description, p.detail,
  p.seo_title, p.seo_description, p.seo_image, p.seo_no_index,
  COALESCE(p.is_active, true)
FROM website_products p
WHERE NOT EXISTS (
  SELECT 1 FROM website_product_translations t
  WHERE t.product_id = p.id AND t.locale = 'id'
);

CREATE TABLE IF NOT EXISTS website_blog_post_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES website_blog_posts(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT,
  content TEXT,
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  seo_image VARCHAR(1000),
  seo_no_index BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, locale),
  UNIQUE (website_id, locale, slug),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

INSERT INTO website_blog_post_translations (
  website_id, post_id, locale, slug, title, excerpt, content,
  seo_title, seo_description, seo_image, seo_no_index, is_published
)
SELECT
  b.website_id, b.id, 'id', b.slug, b.title, b.excerpt, b.content,
  b.seo_title, b.seo_description, b.seo_image, b.seo_no_index, b.is_published
FROM website_blog_posts b
WHERE NOT EXISTS (
  SELECT 1 FROM website_blog_post_translations t
  WHERE t.post_id = b.id AND t.locale = 'id'
);

CREATE TABLE IF NOT EXISTS website_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  logo_url VARCHAR(1000),
  website_url VARCHAR(1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_client_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES website_clients(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, locale),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS website_portfolio_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  client_id UUID REFERENCES website_clients(id) ON DELETE SET NULL,
  cover_image VARCHAR(1000),
  project_url VARCHAR(1000),
  project_type VARCHAR(100),
  year INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  seo_no_index BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, slug)
);

CREATE TABLE IF NOT EXISTS website_portfolio_project_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES website_portfolio_projects(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary VARCHAR(500),
  description TEXT,
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  seo_image VARCHAR(1000),
  seo_no_index BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, locale),
  UNIQUE (website_id, locale, slug),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS website_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  menu_key VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES website_menu_items(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('internal', 'external')),
  target_key VARCHAR(255),
  external_url VARCHAR(1000),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_menu_items_menu_key
  ON website_menu_items(website_id, menu_key, sort_order);

CREATE TABLE IF NOT EXISTS website_menu_item_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES website_menu_items(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  label VARCHAR(255) NOT NULL,
  internal_slug VARCHAR(255),
  external_url VARCHAR(1000),
  target VARCHAR(10) NOT NULL DEFAULT '_self' CHECK (target IN ('_self', '_blank')),
  rel VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, locale),
  FOREIGN KEY (website_id, locale) REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_website_page_translations_lookup
  ON website_page_translations(website_id, locale, slug);
CREATE INDEX IF NOT EXISTS idx_website_product_translations_lookup
  ON website_product_translations(website_id, locale, slug);
CREATE INDEX IF NOT EXISTS idx_website_blog_post_translations_lookup
  ON website_blog_post_translations(website_id, locale, slug);
CREATE INDEX IF NOT EXISTS idx_website_portfolio_project_translations_lookup
  ON website_portfolio_project_translations(website_id, locale, slug);
CREATE INDEX IF NOT EXISTS idx_website_portfolio_project_published
  ON website_portfolio_projects(website_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_client_active
  ON website_clients(website_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_menu_item_lookup
  ON website_menu_items(website_id, menu_key, is_active, sort_order);

COMMENT ON TABLE website_languages IS 'Active localization languages for a website; baseline existing website is id/Indonesia.';
COMMENT ON TABLE website_page_translations IS 'Localized page text and SEO metadata. Master website_pages remain backward-compatible.';
COMMENT ON TABLE website_section_translations IS 'Localized section content JSON. Master website_sections remain backward-compatible.';
COMMENT ON TABLE website_product_translations IS 'Localized product text and SEO metadata. Master website_products remain backward-compatible.';
COMMENT ON TABLE website_blog_post_translations IS 'Localized blog text and SEO metadata. Master website_blog_posts remain backward-compatible.';
COMMENT ON TABLE website_portfolio_projects IS 'Localized portfolio project master data and external project CTA.';
COMMENT ON TABLE website_clients IS 'Website-wide client/logo master data.';
COMMENT ON TABLE website_menu_items IS 'Internal and external website menu resources.';
