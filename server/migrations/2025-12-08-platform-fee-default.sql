-- Set default 0 for fee_amount to avoid NULL inserts
ALTER TABLE platform_fees
  ALTER COLUMN fee_amount SET DEFAULT 0;

-- Backfill any existing NULLs defensively
UPDATE platform_fees
SET fee_amount = 0
WHERE fee_amount IS NULL;

