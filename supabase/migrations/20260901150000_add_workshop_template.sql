-- Register the Workshop template for existing environments.
-- seed.sql covers fresh local resets; this migration makes the option available
-- to already-provisioned admin/API databases as well.
INSERT INTO website_templates (id, name, slug, description, preview_image, structure, is_active)
VALUES (
  'a1b2c3d4-0003-4000-8000-000000000001',
  'Workshop',
  'workshop',
  'Template industrial untuk kontraktor konstruksi baja, welding, aluminium, dan fabrikasi custom.',
  NULL,
  '{
    "theme": {
      "mode": "light",
      "background": "#EDEAE3",
      "surface": "#F7F5F0",
      "text": "#1A1D1F",
      "muted": "#687078",
      "accent": "#E8620C",
      "accent_hover": "#C84E08",
      "border": "#D6D0C5",
      "warning": "#F2B705"
    },
    "sections": [
      {"type":"hero","defaults":{"eyebrow":"KONSTRUKSI BAJA · WELDING · ALUMINIUM","headline":"Dibangun untuk bertahan.","lede":"Solusi konstruksi dan fabrikasi custom.","show_whatsapp_cta":true}},
      {"type":"stats","defaults":{"items":[{"value":"15+","label":"Tahun pengalaman"},{"value":"300+","label":"Proyek selesai"},{"value":"100%","label":"Custom sesuai kebutuhan"}]}},
      {"type":"features_grid","defaults":{"title":"Presisi di setiap detail","feature_1_title":"Material pilihan","feature_1_desc":"Material teruji untuk hasil yang tahan lama.","feature_2_title":"Pengerjaan presisi","feature_2_desc":"Dikerjakan dengan standar dan pengukuran yang akurat.","feature_3_title":"Tim berpengalaman","feature_3_desc":"Tim workshop siap menangani proyek custom."}},
      {"type":"category_grid","defaults":{"title":"Spesialisasi kami","source":"products"}},
      {"type":"services_grid","defaults":{"title":"Layanan Workshop","source":"products","filter_type":"service"}},
      {"type":"service_process_section","defaults":{"title":"Dari ide menjadi nyata","subtitle":"Alur kerja transparan dari konsultasi sampai serah terima.","flow_id":"","preview_steps":[{"number":"01","title":"Konsultasi","body":"Kaji kebutuhan dan target proyek."},{"number":"02","title":"Survey & Ukur","body":"Validasi lokasi dan ukuran lapangan."},{"number":"03","title":"Produksi","body":"Fabrikasi sesuai gambar kerja."},{"number":"04","title":"Instalasi","body":"Pemasangan dan serah terima."}]}},
      {"type":"gallery","defaults":{"title":"Hasil pengerjaan kami","images":[]}},
      {"type":"about","defaults":{"title":"Dibuat di workshop, dipasang dengan presisi","body":"Kami membantu mewujudkan kebutuhan konstruksi dan fabrikasi custom."}},
      {"type":"faq_list","defaults":{"title":"Pertanyaan umum","source":"faqs"}},
      {"type":"contact","defaults":{"title":"Punya proyek? Mari bicara.","subtitle":"Ceritakan kebutuhan Anda kepada tim kami.","show_form":false}}
    ],
    "master_defaults": {
      "tagline":"Solusi konstruksi dan fabrikasi custom.",
      "categories":[
        {"label":"Baja Ringan","image":""},
        {"label":"Welding / Las","image":""},
        {"label":"Aluminium","image":""},
        {"label":"Konstruksi Berat","image":""}
      ],
      "services":[
        {"name":"Kanopi Custom","price":0,"description":"Kanopi baja dan aluminium sesuai ukuran lokasi."},
        {"name":"Pagar dan Railing","price":0,"description":"Pagar, railing, dan kebutuhan pengaman custom."},
        {"name":"Fabrikasi Welding","price":0,"description":"Pengerjaan welding untuk kebutuhan proyek."},
        {"name":"Konstruksi Baja","price":0,"description":"Struktur baja untuk kebutuhan komersial dan industri."}
      ],
      "faqs":[
        {"question":"Bisa custom sesuai ukuran?","answer":"Bisa. Setiap proyek kami ukur dan sesuaikan dengan kondisi lokasi.","category":"general"},
        {"question":"Berapa lama pengerjaannya?","answer":"Estimasi bergantung pada ukuran dan kompleksitas proyek.","category":"process"},
        {"question":"Apakah melayani survey lokasi?","answer":"Ya, tim kami dapat membantu survey dan pengukuran lokasi.","category":"process"}
      ],
      "location":{"name":"Workshop Utama","type":"workshop","address_line":"Jl. Industri No. 10","city":"Jakarta","opening_hours":{"note":"Senin - Sabtu: 08:00 - 17:00"}}
    }
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  structure = EXCLUDED.structure,
  is_active = EXCLUDED.is_active,
  updated_at = now();
