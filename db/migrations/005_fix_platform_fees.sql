ALTER TABLE platform_fees
  ALTER COLUMN fee_amount DROP NOT NULL,
  ALTER COLUMN fee_amount SET DEFAULT 0;

UPDATE platform_fees
SET fee_amount = 0
WHERE fee_amount IS NULL;

