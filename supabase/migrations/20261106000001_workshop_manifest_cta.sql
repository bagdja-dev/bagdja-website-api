-- Template Workshop kini merender section `cta` (Ajakan Bertindak).
--
-- Menambahkan `cta` ke daftar sections manifest Workshop supaya muncul di
-- pilihan "Tambah section" Studio. Isi manifest identik dengan konstanta
-- BUILTIN_TEMPLATE_MANIFESTS (slug 'workshop') di
-- src/modules/templates/template-manifest.ts; manifest barber-classic dan
-- store-classic tidak berubah.
--
-- Aman dijalankan ulang: hanya UPDATE berdasarkan slug, tidak menyentuh data website.

UPDATE website_templates
SET manifest = '{"slug":"workshop","name":"Workshop","version":"1.0.0","rendererApiVersion":1,"isBuiltin":true,"businessProfiles":["service_business","project_quotation"],"capabilities":["catalog","cart","checkout","orders","blog","faq","gathering","buyer_auth","chat","digital_delivery"],"sections":["hero","about","gallery","features_grid","testimonial","services_grid","category_grid","service_process_section","cta","contact","faq_list","blog_list","blog_search","blog_collection"]}'::jsonb
WHERE slug = 'workshop';
