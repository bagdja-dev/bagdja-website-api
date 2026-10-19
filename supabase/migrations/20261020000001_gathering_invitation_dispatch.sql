ALTER TABLE website_gathering_operations
  DROP CONSTRAINT IF EXISTS website_gathering_operations_kind_check;

ALTER TABLE website_gathering_operations
  ADD CONSTRAINT website_gathering_operations_kind_check
  CHECK (kind IN ('INVOICE_ISSUANCE', 'INVITATION_REVOCATION', 'INVITATION_DISPATCH'));
