-- Refresh store-classic template defaults from the completed "fashion-store" dogfood website:
-- real product photos, color/size variants (parent_key/parent_key linking), category cover images,
-- and the finalized home-page section order/content.
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
      "type": "hero",
      "defaults": {
        "subtitle": "Frequently Asked Question",
        "image_url": "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/sections/1786050028535.webp",
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
      "type": "faq_list",
      "defaults": {
        "title": "Pertanyaan Umum",
        "source": "faqs"
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
  '{master_defaults}',
  '{
    "tagline": "Your Style Our Inside",
    "location": {
      "name": "Toko Utama",
      "type": "branch",
      "address_line": "Jl. Fashion Raya No. 45, Bandung",
      "city": "Bandung",
      "opening_hours": { "note": "Setiap hari: 10:00 - 21:00" }
    },
    "faqs": [
      {
        "question": "Apakah bisa tukar ukuran?",
        "answer": "Bisa, tukar ukuran gratis dalam 3 hari selama tag & label belum dilepas.",
        "category": "general"
      },
      {
        "question": "Metode pembayaran apa saja yang diterima?",
        "answer": "Kami menerima transfer bank, QRIS, dan COD untuk area tertentu.",
        "category": "payment"
      },
      {
        "question": "Berapa lama estimasi pengiriman?",
        "answer": "1-3 hari kerja untuk Jabodetabek, 3-7 hari kerja untuk luar kota.",
        "category": "shipping"
      }
    ],
    "categories": [
      { "label": "Atasan", "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/categories/1786005765356.png"] },
      { "label": "Bawahan", "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/categories/1786016389572.png"] },
      { "label": "Dress", "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/categories/1786016585598.png"] },
      { "label": "Outerwear", "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/categories/1786016720037.png"] },
      { "label": "Anak Anak", "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/categories/1786000511112.png"] }
    ],
    "products": [
      {
        "key": "kaos-oversize-katun",
        "sku": "ATS-001",
        "name": "Kaos Oversize Katun",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786038697988.png"],
        "price": 99000,
        "category": "Atasan",
        "description": "Bahan katun combed 24s, potongan oversize kekinian.",
        "variant_attributes": { "Warna": "Abu" }
      },
      {
        "key": "kemeja-flanel-kotak",
        "sku": "ATS-002",
        "name": "Kemeja Flanel Kotak",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786042905974.png"],
        "price": 159000,
        "category": "Atasan",
        "description": "Motif kotak klasik, cocok untuk gaya casual maupun semi-formal.",
        "variant_attributes": { "Ukuran": "S", "Warna": "Merah" }
      },
      {
        "key": "celana-jeans-slim-fit",
        "sku": "BWH-001",
        "name": "Celana Jeans Slim Fit",
        "images": [
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786049717852.png",
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786050427300.png"
        ],
        "price": 219000,
        "category": "Bawahan",
        "description": "Denim stretch, nyaman dipakai sepanjang hari."
      },
      {
        "key": "celana-chino-regular",
        "sku": "BWH-002",
        "name": "Celana Chino Regular",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786046842870.png"],
        "price": 189000,
        "category": "Bawahan",
        "description": "Bahan chino ringan, tersedia beberapa pilihan warna.",
        "variant_attributes": { "Ukuran": "M", "Warna": "Krem" }
      },
      {
        "key": "jaket-denim-unisex",
        "sku": "OTW-001",
        "name": "Jaket Denim Unisex",
        "images": [
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786049752581.png",
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786050449890.png"
        ],
        "price": 259000,
        "category": "Outerwear",
        "description": "Jaket denim tebal, unisex, cocok untuk segala musim."
      },
      {
        "key": "dress-casual-midi",
        "sku": "DRS-001",
        "name": "Dress Casual Midi",
        "images": [
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786050693041.png",
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786050762001.png",
          "https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786050786368.png"
        ],
        "price": 229000,
        "category": "Dress",
        "description": "Dress midi bahan rayon adem, cocok untuk jalan-jalan maupun kerja."
      },
      {
        "key": "kaos-oversize-katun-red",
        "parent_key": "kaos-oversize-katun",
        "name": "Kaos Oversize Katun",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786038729150.png"],
        "price": 35000,
        "category": "Atasan",
        "variant_attributes": { "Warna": "Merah" },
        "inherit_description": true
      },
      {
        "key": "celana-chino-regular-hitam-s",
        "parent_key": "celana-chino-regular",
        "name": "Celana Chino Regular",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786047088704.png"],
        "price": 186000,
        "category": "Bawahan",
        "variant_attributes": { "Ukuran": "S", "Warna": "Hitam" },
        "inherit_description": true
      },
      {
        "key": "celana-chino-regular-hitam-m",
        "parent_key": "celana-chino-regular",
        "name": "Celana Chino Regular",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786048194173.png"],
        "price": 189000,
        "category": "Bawahan",
        "variant_attributes": { "Ukuran": "M", "Warna": "Hitam" },
        "inherit_description": true
      },
      {
        "key": "celana-chino-regular-hitam-l",
        "parent_key": "celana-chino-regular",
        "name": "Celana Chino Regular",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786048128104.png"],
        "price": 189000,
        "category": "Bawahan",
        "variant_attributes": { "Ukuran": "L", "Warna": "Hitam" },
        "inherit_description": true
      },
      {
        "key": "celana-chino-regular-cokelat-m",
        "parent_key": "celana-chino-regular",
        "name": "Celana Chino Regular",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786048170668.png"],
        "price": 189000,
        "category": "Bawahan",
        "variant_attributes": { "Warna": "Cokelat", "Ukuran": "M" },
        "inherit_description": true
      },
      {
        "key": "celana-chino-regular-krem-m",
        "parent_key": "celana-chino-regular",
        "name": "Celana Chino Regular",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786046938814.png"],
        "price": 186000,
        "category": "Bawahan",
        "variant_attributes": { "Ukuran": "L", "Warna": "Krem" },
        "inherit_description": true
      },
      {
        "key": "kemeja-flanel-kotak-merah-l",
        "parent_key": "kemeja-flanel-kotak",
        "name": "Kemeja Flanel Kotak",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786043295896.png"],
        "price": 159000,
        "category": "Atasan",
        "variant_attributes": { "Ukuran": "L", "Warna": "Merah" },
        "inherit_description": false
      },
      {
        "key": "kemeja-flanel-kotak-biru-m",
        "parent_key": "kemeja-flanel-kotak",
        "name": "Kemeja Flanel Kotak",
        "images": ["https://kipfqskggkglgbhuoide.supabase.co/storage/v1/object/public/website-assets/websites/6ca9a76d-cde9-4f4c-9f3d-06fb349a3e97/products/1786043458023.png"],
        "price": 159000,
        "category": "Atasan",
        "variant_attributes": { "Ukuran": "M", "Warna": "Biru" },
        "inherit_description": false
      }
    ]
  }'::jsonb
)
where slug = 'store-classic';
