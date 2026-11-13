-- Exact external template runtime version assigned to this website.
-- NULL keeps the website on its built-in renderer; tenants cannot change this
-- field through the public website update DTO.
ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS template_runtime_version VARCHAR(100) NULL;

COMMENT ON COLUMN websites.template_runtime_version IS
  'Exact approved template package version pinned for this website runtime. NULL means built-in renderer.';
