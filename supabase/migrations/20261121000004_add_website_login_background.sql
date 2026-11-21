ALTER TABLE websites
  ADD COLUMN login_background_url varchar(2048);

COMMENT ON COLUMN websites.login_background_url IS
  'Public HTTPS background image URL displayed on the central Bagdja login page for this website.';
