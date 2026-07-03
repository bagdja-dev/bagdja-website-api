-- =============================================================
-- Seed Data — Bagdja Website Builder (idempotent)
-- =============================================================

-- 1) Template: Barber Classic
INSERT INTO website_templates (id, name, slug, description, preview_image, structure, is_active)
VALUES (
  'a1b2c3d4-0001-4000-8000-000000000001',
  'Barber Classic',
  'barber-classic',
  'Template premium untuk barbershop. Tema dark (zinc-950) dengan aksen amber. Cocok untuk barbershop, salon, dan layanan grooming.',
  NULL,
  '{
    "sections": [
      {
        "type": "hero",
        "defaults": {
          "tagline": "Premium Barbershop",
          "title": "Nama Barbershop Anda",
          "description": "Barbershop terpercaya dengan layanan potong rambut, cukur, dan grooming premium.",
          "cta_text": "Booking via WhatsApp",
          "cta_url": "https://wa.me/62812xxxx"
        }
      },
      {
        "type": "services",
        "defaults": {
          "title": "Layanan Kami",
          "items": [
            { "name": "Potong Rambut", "price": 50000, "duration": "30 menit", "description": "Potong rambut sesuai style pilihan" },
            { "name": "Cukur Jenggot", "price": 35000, "duration": "20 menit", "description": "Trim dan shaping jenggot profesional" },
            { "name": "Hair Wash", "price": 25000, "duration": "15 menit", "description": "Keramas dengan produk premium" },
            { "name": "Paket Komplit", "price": 100000, "duration": "60 menit", "description": "Potong + cukur + hair wash + styling" }
          ]
        }
      },
      {
        "type": "location",
        "defaults": {
          "title": "Lokasi",
          "address": "Jl. Contoh No. 123, Jakarta",
          "hours": "Senin - Sabtu: 09:00 - 21:00",
          "maps_embed": null
        }
      },
      {
        "type": "faq",
        "defaults": {
          "title": "FAQ",
          "items": [
            { "question": "Apakah harus booking dulu?", "answer": "Tidak harus, tapi booking via WhatsApp disarankan agar tidak perlu antri." },
            { "question": "Metode pembayaran apa saja?", "answer": "Kami menerima cash, transfer bank, dan QRIS." },
            { "question": "Apakah ada layanan untuk anak-anak?", "answer": "Tentu! Kami menyediakan potong rambut anak dengan harga khusus." }
          ]
        }
      }
    ],
    "theme": {
      "background": "zinc-950",
      "accent": "amber",
      "font": "system-ui"
    }
  }'::jsonb,
  true
) ON CONFLICT (id) DO NOTHING;

-- 2) Contoh website untuk development
INSERT INTO websites (id, org_id, name, slug, domain, template_id, is_active)
VALUES (
  'b1b2c3d4-0001-4000-8000-000000000001',
  'demo-org',
  'Jhons Barbershop',
  'jhons-barbershop',
  NULL,
  'a1b2c3d4-0001-4000-8000-000000000001',
  true
) ON CONFLICT (id) DO NOTHING;

-- 3) Contoh halaman untuk website demo
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

-- 4) Contoh sections untuk halaman home (no fixed id, use ON CONFLICT on composite)
-- Sections tidak punya unique constraint selain PK, jadi kita beri ID tetap
INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0001-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'hero',
  '{
    "tagline": "Est. 2020",
    "title": "Jhons Barbershop",
    "description": "Barbershop premium di Jakarta Selatan. Potong rambut, cukur, dan grooming dengan sentuhan profesional.",
    "cta_text": "Booking via WhatsApp",
    "cta_url": "https://wa.me/6281234567890"
  }'::jsonb,
  0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0002-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'services',
  '{
    "title": "Layanan Kami",
    "items": [
      { "name": "Potong Rambut Pria", "price": 60000, "duration": "30 menit", "description": "Konsultasi style + potong presisi" },
      { "name": "Cukur & Shaving", "price": 40000, "duration": "25 menit", "description": "Hot towel shave klasik" },
      { "name": "Kids Cut", "price": 45000, "duration": "20 menit", "description": "Potong rambut anak (dibawah 12 tahun)" },
      { "name": "Hair Coloring", "price": 150000, "duration": "90 menit", "description": "Pewarnaan rambut premium" },
      { "name": "Paket VIP", "price": 120000, "duration": "75 menit", "description": "Potong + shaving + hair wash + styling + massage" }
    ]
  }'::jsonb,
  1
) ON CONFLICT (id) DO NOTHING;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0003-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'location',
  '{
    "title": "Kunjungi Kami",
    "address": "Jl. Kemang Raya No. 45, Jakarta Selatan 12730",
    "hours": "Senin - Sabtu: 10:00 - 21:00 | Minggu: 10:00 - 17:00",
    "phone": "+62 812 3456 7890",
    "maps_embed": null
  }'::jsonb,
  2
) ON CONFLICT (id) DO NOTHING;

INSERT INTO website_sections (id, page_id, type, content, "order") VALUES
(
  'e1000000-0004-4000-8000-000000000001',
  'c1b2c3d4-0001-4000-8000-000000000001',
  'faq',
  '{
    "title": "Pertanyaan Umum",
    "items": [
      { "question": "Apakah harus booking terlebih dahulu?", "answer": "Walk-in dipersilakan, tapi booking via WhatsApp direkomendasikan terutama di akhir pekan untuk menghindari antrian." },
      { "question": "Metode pembayaran apa saja yang tersedia?", "answer": "Kami menerima cash, transfer bank (BCA, Mandiri, BNI), GoPay, OVO, dan QRIS." },
      { "question": "Berapa lama waktu tunggu rata-rata?", "answer": "Jika walk-in, waktu tunggu biasanya 15-30 menit tergantung antrian. Booking via WhatsApp meminimalkan waktu tunggu." },
      { "question": "Apakah menyediakan layanan untuk anak-anak?", "answer": "Ya, kami punya Kids Cut khusus untuk anak dibawah 12 tahun dengan harga lebih terjangkau dan suasana yang nyaman." }
    ]
  }'::jsonb,
  3
) ON CONFLICT (id) DO NOTHING;

-- 5) Contoh tenant staff (owner)
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

-- 6) Contoh produk / layanan (website_products)
INSERT INTO website_products (id, website_id, name, description, price, images, is_active) VALUES
(
  'f1000000-0001-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Pomade Premium',
  'Pomade water-based dengan hold kuat dan aroma maskulin.',
  85000,
  '["https://placehold.co/400x400?text=Pomade"]'::jsonb,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO website_products (id, website_id, name, description, price, images, is_active) VALUES
(
  'f1000000-0002-4000-8000-000000000001',
  'b1b2c3d4-0001-4000-8000-000000000001',
  'Beard Oil',
  'Minyak jenggot organik untuk jenggot lembut dan sehat.',
  65000,
  '["https://placehold.co/400x400?text=BeardOil"]'::jsonb,
  true
) ON CONFLICT (id) DO NOTHING;
