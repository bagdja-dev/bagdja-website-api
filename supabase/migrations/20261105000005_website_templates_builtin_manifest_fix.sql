-- KOREKTIF untuk 20261105000003_website_templates_builtin_manifest.sql.
--
-- File 000003 sempat kosong saat pertama kali dijalankan di database, sehingga
-- website_templates.manifest ketiga template bawaan masih NULL. Akibatnya:
-- GET /api/templates/:slug/manifest → 404, dan pratinjau langsung template di
-- Studio (wizard & tab Template) jatuh ke sketsa karena manifest.isBuiltin kosong.
--
-- Isi di bawah identik dengan 000003 (sumber: BUILTIN_TEMPLATE_MANIFESTS di
-- src/modules/templates/template-manifest.ts). Aman dijalankan ulang: hanya
-- UPDATE berdasarkan slug, tidak menyentuh data website.

UPDATE website_templates
SET manifest = '{"slug":"barber-classic","name":"Barber Classic","version":"1.0.0","rendererApiVersion":1,"isBuiltin":true,"businessProfiles":["service_business","company_profile"],"capabilities":["catalog","cart","checkout","orders","blog","faq","locations","gathering","buyer_auth","chat","digital_delivery"],"sections":["text_block","rich_text","about","gallery","testimonial","services_grid","products_grid","category_grid","cta","contact","locations_list","faq_list","blog_list","blog_search","blog_collection"]}'::jsonb,
    business_profiles = ARRAY['service_business','company_profile']
WHERE slug = 'barber-classic';

UPDATE website_templates
SET manifest = '{"slug":"store-classic","name":"Store Classic","version":"1.0.0","rendererApiVersion":1,"isBuiltin":true,"businessProfiles":["online_store","digital_goods"],"capabilities":["catalog","cart","checkout","orders","blog","faq","locations","gathering","buyer_auth","chat","digital_delivery"],"sections":["hero","text_block","rich_text","about","gallery","features_grid","logo_wall","testimonial","services_grid","products_grid","category_grid","featured_product","cta","contact","locations_list","faq_list","blog_list","blog_search","blog_collection"]}'::jsonb,
    business_profiles = ARRAY['online_store','digital_goods']
WHERE slug = 'store-classic';

UPDATE website_templates
SET manifest = '{"slug":"workshop","name":"Workshop","version":"1.0.0","rendererApiVersion":1,"isBuiltin":true,"businessProfiles":["service_business","project_quotation"],"capabilities":["catalog","cart","checkout","orders","blog","faq","gathering","buyer_auth","chat","digital_delivery"],"sections":["hero","about","gallery","features_grid","testimonial","services_grid","category_grid","service_process_section","contact","faq_list","blog_list","blog_search","blog_collection"]}'::jsonb,
    business_profiles = ARRAY['service_business','project_quotation']
WHERE slug = 'workshop';
