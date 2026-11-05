-- R1 (template-contract.md §3): manifest tiga template bawaan, diturunkan dari inventaris R0 (§5).
-- Isi JSON harus sama dengan BUILTIN_TEMPLATE_MANIFESTS di src/modules/templates/template-manifest.ts
-- (diuji di template-manifest.spec.ts). Juga menyelaraskan kolom business_profiles.

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
