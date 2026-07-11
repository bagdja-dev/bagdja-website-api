-- =============================================================
-- Seed Data — Bagdja Website Builder (idempotent)
-- Phase 6.5A: master data (websites profil, locations, faqs, products by type)
-- =============================================================

-- 1) Template: Barber Classic (section palette = presentation layer)
INSERT INTO website_templates (id, name, slug, description, preview_image, structure, is_active)
VALUES (
  'a1b2c3d4-0001-4000-8000-000000000001',
  'Barber Classic',
  'barber-classic',
  'Template premium untuk barbershop. Tema dark (zinc-950) dengan aksen amber. Cocok untuk barbershop, salon, dan layanan grooming.',
  NULL,
  '{
    "theme": {
      "background": "zinc-950",
      "accent": "amber",
      "font": "system-ui"
    },
    "sections": [
      {
        "type": "hero",
        "defaults": {
          "subtitle": "Premium Barbershop",
          "show_whatsapp_cta": true
        }
      },
      {
        "type": "services_grid",
        "defaults": {
          "title": "Layanan Kami",
          "source": "products",
          "filter_type": "service"
        }
      },
      {
        "type": "products_grid",
        "defaults": {
          "title": "Produk Kami",
          "source": "products",
          "filter_type": "product"
        }
      },
      {
        "type": "locations_list",
        "defaults": {
          "title": "Kunjungi Kami",
          "source": "locations",
          "filter_types": ["branch"]
        }
      },
      {
        "type": "faq_list",
        "defaults": {
          "title": "Pertanyaan Umum",
          "source": "faqs"
        }
      }
    ],
    "master_defaults": {
      "tagline": "Premium Barbershop",
      "services": [
        { "name": "Potong Rambut", "price": 50000, "duration_minutes": 30, "description": "Potong rambut sesuai style pilihan", "image": "https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313503792-87e70f14-haircut" },
        { "name": "Cukur Jenggot", "price": 35000, "duration_minutes": 20, "description": "Trim dan shaping jenggot profesional", "image": "https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313490216-dc69c67e-shave" },
        { "name": "Hair Wash", "price": 25000, "duration_minutes": 15, "description": "Keramas dengan produk premium", "image": "https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313456720-66550be3-hairwash" },
        { "name": "Paket Komplit", "price": 100000, "duration_minutes": 60, "description": "Potong + cukur + hair wash + styling", "image": "https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313444388-0d6a084e-barbershop" }
      ],
      "products": [
        { "name": "Pomade Premium", "price": 85000, "description": "Pomade water-based dengan hold kuat dan aroma maskulin.", "image": "https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313473500-b9465e70-pomade", "sku": "POM-001" },
        { "name": "Beard Oil", "price": 65000, "description": "Minyak jenggot organik untuk jenggot lembut dan sehat.", "image": "https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313425069-afac0c08-berdoil", "sku": "BO-001" }
      ],
      "faqs": [
        { "question": "Apakah harus booking dulu?", "answer": "Tidak harus, tapi booking via WhatsApp disarankan agar tidak perlu antri.", "category": "general" },
        { "question": "Metode pembayaran apa saja?", "answer": "Kami menerima cash, transfer bank, dan QRIS.", "category": "payment" },
        { "question": "Apakah ada layanan untuk anak-anak?", "answer": "Tentu! Kami menyediakan potong rambut anak dengan harga khusus.", "category": "general" }
      ],
      "location": {
        "name": "Cabang Utama",
        "type": "branch",
        "address_line": "Jl. Contoh No. 123, Jakarta",
        "city": "Jakarta Selatan",
        "opening_hours": { "note": "Senin - Sabtu: 09:00 - 21:00" }
      }
    }
  }'::jsonb,
  true
) ON CONFLICT (id) DO UPDATE SET
  structure = EXCLUDED.structure,
  description = EXCLUDED.description;

-- 2) Contoh website demo — profil brand
INSERT INTO websites (
  id, name, slug, domain, template_id,
  tagline, logo_url, whatsapp, phone, email,
  social_links, opening_hours, is_active
)
VALUES (
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Jhons Barbershop',
  'jhons-barbershop',
  NULL,
  'a1b2c3d4-0001-4000-8000-000000000001',
  'Premium Barbershop sejak 2020',
  NULL,
  '6281234567890',
  '+62 812 3456 7890',
  'hello@jhonsbarbershop.com',
  '{"instagram": "jhonsbarbershop"}'::jsonb,
  '{"note": "Senin - Sabtu: 10:00 - 21:00 | Minggu: 10:00 - 17:00"}'::jsonb,
  true
) ON CONFLICT (id) DO UPDATE SET
  tagline = EXCLUDED.tagline,
  whatsapp = EXCLUDED.whatsapp,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  social_links = EXCLUDED.social_links,
  opening_hours = EXCLUDED.opening_hours;

-- 3) Halaman home
INSERT INTO website_pages (id, website_id, title, slug, content, is_home, "order")
VALUES (
  'c1b2c3d4-0001-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Home',
  'home',
  '{}'::jsonb,
  true,
  0
) ON CONFLICT (id) DO NOTHING;

-- 4) Sections — presentation layer (baca master data)
INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0001-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'hero',
  '{"subtitle": "Est. 2020", "show_whatsapp_cta": true}'::jsonb,
  0
) ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, content = EXCLUDED.content;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0002-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'services_grid',
  '{"title": "Layanan Kami", "source": "products", "filter_type": "service"}'::jsonb,
  1
) ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, content = EXCLUDED.content;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0003-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'locations_list',
  '{"title": "Kunjungi Kami", "source": "locations", "filter_types": ["branch"]}'::jsonb,
  2
) ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, content = EXCLUDED.content;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0004-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'faq_list',
  '{"title": "Pertanyaan Umum", "source": "faqs"}'::jsonb,
  3
) ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, content = EXCLUDED.content;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0005-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'products_grid',
  '{"title": "Produk Kami", "source": "products", "filter_type": "product"}'::jsonb,
  4
) ON CONFLICT (id) DO NOTHING;

-- 5) Lokasi demo
INSERT INTO website_locations (
  id, website_id, name, type, is_primary, is_public,
  address_line, city, province, phone, whatsapp, opening_hours, sort_order, is_active
) VALUES (
  'b2000000-0001-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Cabang Kemang',
  'branch',
  true,
  true,
  'Jl. Kemang Raya No. 45, Jakarta Selatan 12730',
  'Jakarta Selatan',
  'DKI Jakarta',
  '+62 812 3456 7890',
  '6281234567890',
  '{"note": "Senin - Sabtu: 10:00 - 21:00 | Minggu: 10:00 - 17:00"}'::jsonb,
  0,
  true
) ON CONFLICT (id) DO NOTHING;

-- 6) FAQ demo
INSERT INTO website_faqs (id, website_id, question, answer, category, sort_order, is_public, is_active) VALUES
(
  'c2000000-0001-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Apakah harus booking terlebih dahulu?',
  'Walk-in dipersilakan, tapi booking via WhatsApp direkomendasikan terutama di akhir pekan untuk menghindari antrian.',
  'general',
  0,
  true,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO website_faqs (id, website_id, question, answer, category, sort_order, is_public, is_active) VALUES
(
  'c2000000-0002-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Metode pembayaran apa saja yang tersedia?',
  'Kami menerima cash, transfer bank (BCA, Mandiri, BNI), GoPay, OVO, dan QRIS.',
  'payment',
  1,
  true,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO website_faqs (id, website_id, question, answer, category, sort_order, is_public, is_active) VALUES
(
  'c2000000-0003-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Apakah menyediakan layanan untuk anak-anak?',
  'Ya, kami punya Kids Cut khusus untuk anak dibawah 12 tahun dengan harga lebih terjangkau.',
  'general',
  2,
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- 7) Tenant staff (owner)
INSERT INTO tenant_staff (id, website_id, user_id, email, role, accepted_at, is_active)
VALUES (
  'd1b2c3d4-0001-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'demo@bagdja.com',
  'owner',
  now(),
  true
) ON CONFLICT (id) DO NOTHING;

-- 8) Produk & layanan (website_products by type)
INSERT INTO website_products (id, website_id, type, name, description, price, images, metadata, sort_order, is_active) VALUES
(
  'f1000000-0001-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'product',
  'Pomade Premium',
  'Pomade water-based dengan hold kuat dan aroma maskulin.',
  85000,
  '["https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313473500-b9465e70-pomade"]'::jsonb,
  '{"sku": "POM-001"}'::jsonb,
  0,
  true
) ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  images = EXCLUDED.images,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order;

INSERT INTO website_products (id, website_id, type, name, description, price, images, metadata, sort_order, is_active) VALUES
(
  'f1000000-0002-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'product',
  'Beard Oil',
  'Minyak jenggot organik untuk jenggot lembut dan sehat.',
  65000,
  '["https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313425069-afac0c08-berdoil"]'::jsonb,
  '{"sku": "BO-001"}'::jsonb,
  1,
  true
) ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  images = EXCLUDED.images,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order;

INSERT INTO website_products (id, website_id, type, name, description, price, images, metadata, sort_order, is_active) VALUES
(
  'f1000000-0003-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'service',
  'Potong Rambut Pria',
  'Konsultasi style + potong presisi.',
  60000,
  '["https://houzcall.co.id/artikel/gunting-rambut-terdekat"]'::jsonb,
  '{"duration_minutes": 30, "is_bookable": true}'::jsonb,
  0,
  true
) ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  images = EXCLUDED.images,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order;

INSERT INTO website_products (id, website_id, type, name, description, price, images, metadata, sort_order, is_active) VALUES
(
  'f1000000-0004-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'service',
  'Cukur & Shaving',
  'Hot towel shave klasik.',
  40000,
  '["https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313490216-dc69c67e-shave"]'::jsonb,
  '{"duration_minutes": 25, "is_bookable": true}'::jsonb,
  1,
  true
) ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  images = EXCLUDED.images,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order;

INSERT INTO website_products (id, website_id, type, name, description, price, images, metadata, sort_order, is_active) VALUES
(
  'f1000000-0005-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'service',
  'Kids Cut',
  'Potong rambut anak (dibawah 12 tahun).',
  45000,
  '["https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313456720-66550be3-hairwash"]'::jsonb,
  '{"duration_minutes": 20, "is_bookable": true}'::jsonb,
  2,
  true
) ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  images = EXCLUDED.images,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order;

INSERT INTO website_products (id, website_id, type, name, description, price, images, metadata, sort_order, is_active) VALUES
(
  'f1000000-0006-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'service',
  'Paket VIP',
  'Potong + shaving + hair wash + styling + massage.',
  120000,
  '["https://jivyvnhqoegiiyodmdnc.supabase.co/storage/v1/object/public/assets/organizations/bagdja-dev/Product%20Sample/1783313444388-0d6a084e-barbershop"]'::jsonb,
  '{"duration_minutes": 75, "is_bookable": true}'::jsonb,
  3,
  true
) ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  images = EXCLUDED.images,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order;
