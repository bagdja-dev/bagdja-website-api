ALTER TABLE websites
  ADD COLUMN search_console_verification_filename varchar(255),
  ADD COLUMN search_console_verification_content varchar(1000);

COMMENT ON COLUMN websites.search_console_verification_filename IS
  'Google Search Console HTML-file verification name, served from the tenant root host.';
COMMENT ON COLUMN websites.search_console_verification_content IS
  'Exact Google Search Console verification content for the configured HTML file.';
