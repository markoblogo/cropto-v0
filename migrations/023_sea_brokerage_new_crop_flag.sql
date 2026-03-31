-- Migration: add new crop flag for sea brokerage entries
ALTER TABLE sea_brokerage_entries
  ADD COLUMN IF NOT EXISTS is_new_crop boolean NOT NULL DEFAULT false;

