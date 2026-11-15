-- Banyak video per produk (seperti foto). `video_url` tetap ada = video pertama (kompatibilitas renderer/template lama).

ALTER TABLE website_products
  ADD COLUMN IF NOT EXISTS video_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Isi dari video_url lama.
UPDATE website_products
SET video_urls = jsonb_build_array(video_url)
WHERE video_url IS NOT NULL
  AND video_url <> ''
  AND video_urls = '[]'::jsonb;

COMMENT ON COLUMN website_products.video_urls IS
  'URL video produk (urut tampil). video_url = elemen pertama, untuk klien lama.';
