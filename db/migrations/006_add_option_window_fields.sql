ALTER TABLE options
  ADD COLUMN IF NOT EXISTS expiry_window text,
  ADD COLUMN IF NOT EXISTS window_start timestamp,
  ADD COLUMN IF NOT EXISTS window_end timestamp,
  ADD COLUMN IF NOT EXISTS settlement_date timestamp,
  ADD COLUMN IF NOT EXISTS long_side text,
  ADD COLUMN IF NOT EXISTS short_side text;

