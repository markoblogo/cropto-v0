-- Migration: add seller/buyer commission fields for sea brokerage trades
ALTER TABLE sea_brokerage_entries
  ADD COLUMN IF NOT EXISTS seller_commission numeric(18,4),
  ADD COLUMN IF NOT EXISTS buyer_commission numeric(18,4);

