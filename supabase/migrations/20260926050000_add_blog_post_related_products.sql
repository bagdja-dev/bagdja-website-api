CREATE TABLE IF NOT EXISTS website_blog_post_products (
  blog_post_id UUID NOT NULL REFERENCES website_blog_posts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES website_products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blog_post_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_website_blog_post_products_order
  ON website_blog_post_products(blog_post_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_website_blog_post_products_product
  ON website_blog_post_products(product_id);