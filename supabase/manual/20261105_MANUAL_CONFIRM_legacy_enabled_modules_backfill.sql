-- =============================================================================
-- !!! JANGAN DIJALANKAN TANPA KONFIRMASI EKSPLISIT DARI OWNER/USER !!!
--
-- Backfill enabled_modules untuk website 'legacy' berbasis data
-- (keputusan D4 opsi (b), admin-redesign-onboarding-plan.md §4.4).
--
-- - Sengaja diletakkan di supabase/manual/ (BUKAN supabase/migrations/) agar
--   TIDAK ikut dijalankan otomatis oleh `npm run db:migrate` / `supabase db push`.
-- - Jadwal: menjelang uji coba Studio (S9), setelah migration
--   20261105000001_website_business_profile_and_modules.sql diterapkan.
-- - Mengubah data production (websites.enabled_modules). Sebelum menjalankan:
--   backup / jalankan dulu SELECT pratinjau di bagian bawah.
-- - Hanya menyentuh website business_profile = 'legacy' DAN enabled_modules
--   masih kosong (idempoten; website yang sudah diatur owner tidak tersentuh).
-- - Dashboard lama tidak membaca enabled_modules, jadi tidak terpengaruh.
--
-- Aturan pemetaan data → modul:
--   inti (selalu)       : site_content, team, subscription, wallet, settings
--   customer_chat       : selalu (inbox chat ada di bagdja-chat-service, tidak
--                         bisa dideteksi dari DB lokal; menu lama selalu tampil)
--   catalog             : punya website_products
--   orders              : punya website_orders atau website_transactions
--   quotes              : punya produk quotable=true atau order dengan quoted_total_amount
--   billing             : punya website_order_termins
--   fulfillment         : punya fulfillment_flows
--   events              : punya website_event_groups
--   digital_delivery    : punya website_assets atau website_product_assets
--   locations           : punya website_locations
--   vendors             : punya website_vendors
--   faq                 : punya website_faqs
--   blog                : punya website_blog_posts
--   android_app         : punya website_android_apps
-- Dependensi (registry §2.3) ditambahkan setelahnya: orders→catalog,
-- quotes→catalog+orders, billing→orders(+catalog), fulfillment→catalog,
-- events→catalog+orders, digital_delivery→catalog+orders, vendors→orders+locations(+catalog).
-- =============================================================================

BEGIN;

WITH detected AS (
  SELECT
    w.id,
    ARRAY['site_content','team','subscription','wallet','settings','customer_chat']
    || CASE WHEN EXISTS (SELECT 1 FROM website_products p WHERE p.website_id = w.id) THEN ARRAY['catalog'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_orders o WHERE o.website_id = w.id)
              OR EXISTS (SELECT 1 FROM website_transactions t WHERE t.website_id = w.id) THEN ARRAY['orders'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_products p WHERE p.website_id = w.id AND p.quotable = true)
              OR EXISTS (SELECT 1 FROM website_orders o WHERE o.website_id = w.id AND o.quoted_total_amount IS NOT NULL) THEN ARRAY['quotes'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_order_termins x WHERE x.website_id = w.id) THEN ARRAY['billing'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM fulfillment_flows f WHERE f.website_id = w.id) THEN ARRAY['fulfillment'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_event_groups g WHERE g.website_id = w.id) THEN ARRAY['events'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_assets a WHERE a.website_id = w.id)
              OR EXISTS (SELECT 1 FROM website_product_assets pa WHERE pa.website_id = w.id) THEN ARRAY['digital_delivery'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_locations l WHERE l.website_id = w.id) THEN ARRAY['locations'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_vendors v WHERE v.website_id = w.id) THEN ARRAY['vendors'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_faqs q WHERE q.website_id = w.id) THEN ARRAY['faq'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_blog_posts b WHERE b.website_id = w.id) THEN ARRAY['blog'] ELSE ARRAY[]::text[] END
    || CASE WHEN EXISTS (SELECT 1 FROM website_android_apps aa WHERE aa.website_id = w.id) THEN ARRAY['android_app'] ELSE ARRAY[]::text[] END
    AS mods
  FROM websites w
  WHERE w.business_profile = 'legacy'
    AND cardinality(w.enabled_modules) = 0
),
with_deps AS (
  SELECT
    d.id,
    d.mods
    || CASE WHEN d.mods && ARRAY['vendors'] THEN ARRAY['orders','locations'] ELSE ARRAY[]::text[] END
    || CASE WHEN d.mods && ARRAY['quotes','billing','events','digital_delivery','vendors'] THEN ARRAY['orders'] ELSE ARRAY[]::text[] END
    || CASE WHEN d.mods && ARRAY['orders','quotes','billing','fulfillment','events','digital_delivery','vendors'] THEN ARRAY['catalog'] ELSE ARRAY[]::text[] END
    AS mods
  FROM detected d
)
UPDATE websites w
SET enabled_modules = (SELECT ARRAY(SELECT DISTINCT unnest(wd.mods) ORDER BY 1))
FROM with_deps wd
WHERE w.id = wd.id;

COMMIT;

-- Pratinjau (jalankan terpisah SEBELUM backfill, read-only):
-- SELECT id, slug, business_profile, enabled_modules FROM websites WHERE business_profile = 'legacy' ORDER BY created_at;
