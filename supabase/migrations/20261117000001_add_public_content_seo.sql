ALTER TABLE website_pages
  ADD COLUMN seo_title varchar(255),
  ADD COLUMN seo_description varchar(500),
  ADD COLUMN seo_image varchar(1000),
  ADD COLUMN seo_no_index boolean NOT NULL DEFAULT false;

ALTER TABLE website_products
  ADD COLUMN seo_title varchar(255),
  ADD COLUMN seo_description varchar(500),
  ADD COLUMN seo_image varchar(1000),
  ADD COLUMN seo_no_index boolean NOT NULL DEFAULT false;

ALTER TABLE website_blog_posts
  ADD COLUMN seo_title varchar(255),
  ADD COLUMN seo_description varchar(500),
  ADD COLUMN seo_image varchar(1000),
  ADD COLUMN seo_no_index boolean NOT NULL DEFAULT false;
