-- Fix: FAQ section (dan hero keduanya) tadinya ikut ter-copy ke sections Home dari
-- migration sebelumnya (20260807000001) karena query sumbernya tidak memisahkan
-- per-halaman. Di fashion-store, FAQ sebenarnya adalah halaman TERSENDIRI
-- (slug "faq"), bukan bagian dari Home. Perbaiki: Home cuma 1 hero + tanpa
-- faq_list, dan tambahkan `structure.extra_pages` untuk halaman FAQ terpisah
-- (di-seed oleh WebsiteBootstrapService.seedExtraPages, lihat kode terkait).
update website_templates
set structure = jsonb_set(
  structure,
  '{sections}',
  '[
    {
      "type": "hero",
      "defaults": {
        "subtitle": "Koleksi Terbaru",
        "image_url": "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/sections/1786049896830.webp",
        "show_whatsapp_cta": true
      }
    },
    {
      "type": "features_grid",
      "defaults": {
        "title": "Kenapa Belanja di Sini",
        "feature_1_desc": "Diproses dalam 1x24 jam kerja.",
        "feature_1_icon": "🚚",
        "feature_2_desc": "Tukar/retur mudah bila ada kendala.",
        "feature_2_icon": "🛡️",
        "feature_3_desc": "Tim kami siap bantu via WhatsApp.",
        "feature_3_icon": "💬",
        "feature_1_title": "Pengiriman Cepat",
        "feature_2_title": "Garansi 7 Hari",
        "feature_3_title": "Respon Cepat"
      }
    },
    {
      "type": "category_grid",
      "defaults": {
        "title": "Kategori Pilihan",
        "source": "products"
      }
    },
    {
      "type": "products_grid",
      "defaults": {
        "title": "Produk Terbaru",
        "source": "products",
        "filter_type": "product"
      }
    },
    {
      "type": "contact",
      "defaults": {
        "title": "Hubungi Kami"
      }
    }
  ]'::jsonb
)
where slug = 'store-classic';

update website_templates
set structure = jsonb_set(
  structure,
  '{extra_pages}',
  '[
    {
      "slug": "faq",
      "title": "FAQ",
      "placement": "regular",
      "sections": [
        {
          "type": "hero",
          "defaults": {
            "subtitle": "Frequently Asked Question",
            "image_url": "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/sections/1786050028535.webp",
            "show_whatsapp_cta": true
          }
        },
        {
          "type": "faq_list",
          "defaults": {
            "title": "Pertanyaan Umum",
            "source": "faqs"
          }
        }
      ]
    }
  ]'::jsonb,
  true
)
where slug = 'store-classic';
