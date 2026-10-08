ALTER TABLE business ADD COLUMN test_batch_id TEXT;
CREATE INDEX business_test_batch ON business(test_batch_id);
