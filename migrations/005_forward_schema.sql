-- Forward orders
CREATE TABLE IF NOT EXISTS forward_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY','SELL')),
  index_id varchar REFERENCES indexes(id),
  commodity text,
  price decimal(18,8) NOT NULL,
  qty_ton decimal(18,8) NOT NULL,
  window text,
  window_start timestamp,
  window_end timestamp,
  settlement_date timestamp,
  status text NOT NULL CHECK (status IN ('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED')) DEFAULT 'OPEN',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Forward contracts
CREATE TABLE IF NOT EXISTS forward_contracts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  buy_order_id varchar REFERENCES forward_orders(id),
  sell_order_id varchar REFERENCES forward_orders(id),
  index_id varchar REFERENCES indexes(id),
  commodity text,
  contract_price decimal(18,8) NOT NULL,
  qty_ton decimal(18,8) NOT NULL,
  window text,
  window_start timestamp,
  window_end timestamp,
  settlement_date timestamp,
  long_user_id text,
  short_user_id text,
  initial_margin decimal(18,8),
  status text NOT NULL CHECK (status IN ('ACTIVE','MARGIN_CALL','SETTLED','LIQUIDATED','DEFAULTED','CANCELLED')) DEFAULT 'ACTIVE',
  contract_hash text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Forward settlements
CREATE TABLE IF NOT EXISTS forward_settlements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  forward_contract_id varchar NOT NULL REFERENCES forward_contracts(id),
  settlement_price decimal(18,8) NOT NULL,
  contract_price decimal(18,8) NOT NULL,
  qty_ton decimal(18,8) NOT NULL,
  pnl_long decimal(18,8) NOT NULL,
  pnl_short decimal(18,8) NOT NULL,
  fees_total decimal(18,8) DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Platform fees instrument type
ALTER TABLE platform_fees
  ADD COLUMN IF NOT EXISTS instrument_type text DEFAULT 'OPTION';
-- Optionally enforce enum check in application code; DB column remains text for compatibility.
