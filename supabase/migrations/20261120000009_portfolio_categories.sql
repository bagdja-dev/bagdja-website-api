CREATE TABLE IF NOT EXISTS website_portfolio_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, slug),
  UNIQUE (id, website_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_portfolio_projects_id_website
  ON website_portfolio_projects(id, website_id);

CREATE TABLE IF NOT EXISTS website_portfolio_category_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL,
  category_id UUID NOT NULL,
  locale VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, locale),
  FOREIGN KEY (category_id, website_id)
    REFERENCES website_portfolio_categories(id, website_id) ON DELETE CASCADE,
  FOREIGN KEY (website_id, locale)
    REFERENCES website_languages(website_id, locale) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS website_portfolio_project_categories (
  project_id UUID NOT NULL,
  category_id UUID NOT NULL,
  website_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, category_id),
  FOREIGN KEY (project_id, website_id)
    REFERENCES website_portfolio_projects(id, website_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, website_id)
    REFERENCES website_portfolio_categories(id, website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_website_portfolio_categories_public
  ON website_portfolio_categories(website_id, is_public, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_website_portfolio_project_categories_category
  ON website_portfolio_project_categories(category_id, project_id);
