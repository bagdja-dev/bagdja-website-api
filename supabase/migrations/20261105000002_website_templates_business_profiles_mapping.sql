-- Studio S1: pemetaan template bawaan → business profile (keputusan S0, 5 Nov 2026;
-- admin-redesign-onboarding-plan.md §4.1). Profile tanpa template khusus
-- (gathering, place_rental, vehicle_rental, event_ticketing) memakai fallback
-- "tampilkan semua template" di sisi Studio.
UPDATE website_templates SET business_profiles = ARRAY['service_business','company_profile'] WHERE slug = 'barber-classic';
UPDATE website_templates SET business_profiles = ARRAY['service_business','project_quotation'] WHERE slug = 'workshop';
UPDATE website_templates SET business_profiles = ARRAY['online_store','digital_goods'] WHERE slug = 'store-classic';
