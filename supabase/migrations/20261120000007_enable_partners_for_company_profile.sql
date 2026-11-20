-- Partner content is part of the company profile experience. Preserve all
-- existing module choices while enabling the unified Partner menu.
UPDATE websites
SET enabled_modules = array_append(enabled_modules, 'vendors')
WHERE business_profile = 'company_profile'
  AND NOT ('vendors' = ANY(enabled_modules));
