ALTER TABLE options
  ADD COLUMN IF NOT EXISTS margin_balance decimal(18,8),
  ADD COLUMN IF NOT EXISTS floating_loss decimal(18,8),
  ADD COLUMN IF NOT EXISTS is_in_margin_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS margin_call_timestamp timestamp,
  ADD COLUMN IF NOT EXISTS margin_call_deadline timestamp;

