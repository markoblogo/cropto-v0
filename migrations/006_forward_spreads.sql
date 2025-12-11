-- Forward spreads table
CREATE TABLE IF NOT EXISTS forward_spreads (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  spread_type text NOT NULL CHECK (spread_type IN ('CALENDAR','CROSS_COMMODITY')),
  leg1_index_id varchar REFERENCES indexes(id),
  leg2_index_id varchar REFERENCES indexes(id),
  leg1_window text,
  leg2_window text,
  spread_price decimal(18,8) NOT NULL,
  base_contract_id varchar REFERENCES forward_contracts(id),
  hedge_contract_id varchar REFERENCES forward_contracts(id),
  status text NOT NULL CHECK (status IN ('OPEN','CANCELLED')) DEFAULT 'OPEN',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
