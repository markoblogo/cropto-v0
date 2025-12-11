-- Add forward support to margin_calls
ALTER TABLE margin_calls
  ADD COLUMN IF NOT EXISTS forward_contract_id varchar REFERENCES forward_contracts(id),
  ADD COLUMN IF NOT EXISTS instrument_type text DEFAULT 'OPTION';

-- Existing rows default to OPTION; forward rows can set instrument_type='FORWARD'
