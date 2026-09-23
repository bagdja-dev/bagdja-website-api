-- Align database constraint with app behavior: QUOTE_SET is part of
-- fulfillment log event types used during draft-quote workflow.
ALTER TABLE website_transaction_fulfillment_logs
  DROP CONSTRAINT IF EXISTS website_transaction_fulfillment_logs_event_type_check;

ALTER TABLE website_transaction_fulfillment_logs
  ADD CONSTRAINT website_transaction_fulfillment_logs_event_type_check
  CHECK (event_type IN ('STEP_COMPLETED', 'STEP_DRAFT', 'RELEASE_APPROVED', 'STEP_DISPUTED', 'QUOTE_SET', 'DELIVERED'));
