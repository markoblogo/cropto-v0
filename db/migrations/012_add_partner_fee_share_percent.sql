-- Migration: add fee_share_percent to partner_organizations
ALTER TABLE partner_organizations
  ADD COLUMN IF NOT EXISTS fee_share_percent DECIMAL(5, 2) NOT NULL DEFAULT 0;

-- Ensure no NULLs (defensive)
UPDATE partner_organizations
SET fee_share_percent = 0
WHERE fee_share_percent IS NULL;
