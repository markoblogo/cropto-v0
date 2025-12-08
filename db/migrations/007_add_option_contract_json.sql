ALTER TABLE options
  ADD COLUMN IF NOT EXISTS contract_json text,
  ADD COLUMN IF NOT EXISTS schema_version text;

