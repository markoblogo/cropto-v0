ALTER TABLE options
  ADD COLUMN IF NOT EXISTS use_premium_as_margin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS initial_margin decimal(18,8);

