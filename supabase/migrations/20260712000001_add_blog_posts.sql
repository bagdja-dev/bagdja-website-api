-- Blog posts per website (dikelola dari admin CMS)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS website_blog_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id    UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) NOT NULL,
  excerpt       TEXT,
  content       TEXT,
  cover_image   VARCHAR(500),
  is_published  BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_website_blog_posts_website_id ON website_blog_posts(website_id);
CREATE INDEX IF NOT EXISTS idx_website_blog_posts_published ON website_blog_posts(website_id, is_published, published_at DESC);

COMMENT ON TABLE website_blog_posts IS 'Artikel blog per website — dikelola dari admin CMS menu Blog';
