UPDATE website_templates
SET manifest = '{"slug":"store-classic","name":"Store Classic","version":"1.0.0","rendererApiVersion":1,"isBuiltin":true,"businessProfiles":["online_store","digital_goods"],"capabilities":["catalog","cart","checkout","orders","blog","faq","locations","gathering","buyer_auth","chat","digital_delivery"],"sections":["hero","text_block","rich_text","about","gallery","features_grid","logo_wall","testimonial","services_grid","products_grid","category_grid","featured_product","portfolio_projects","cta","contact","locations_list","faq_list","blog_list","blog_search","blog_collection"]}'::jsonb,
    updated_at = now()
WHERE slug = 'store-classic';
