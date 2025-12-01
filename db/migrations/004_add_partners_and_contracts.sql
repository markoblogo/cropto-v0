-- Create partner_organizations table
CREATE TABLE IF NOT EXISTS partner_organizations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('prime_broker', 'custody', 'liquidity_provider', 'security_auditor', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create service_contracts table
CREATE TABLE IF NOT EXISTS service_contracts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id VARCHAR NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  contract_code TEXT NOT NULL UNIQUE,
  value_usd DECIMAL(18, 2) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'completed', 'terminated')),
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_service_contracts_partner_id ON service_contracts(partner_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_status ON service_contracts(status);
CREATE INDEX IF NOT EXISTS idx_partner_organizations_status ON partner_organizations(status);

-- Insert demo data to match existing UI
INSERT INTO partner_organizations (id, name, contact_email, relationship, status, notes) VALUES
  ('demo-partner-1', 'BlockTrade Partners', 'contact@blocktrade.io', 'prime_broker', 'active', 'Primary institutional broker'),
  ('demo-partner-2', 'CryptoVault Inc', 'partnerships@cryptovault.com', 'custody', 'active', 'Digital asset custody provider'),
  ('demo-partner-3', 'DeFi Solutions Ltd', 'admin@defisolutions.xyz', 'liquidity_provider', 'pending', 'Liquidity provision services'),
  ('demo-partner-4', 'ChainGuard Security', 'security@chainguard.io', 'security_auditor', 'active', 'Security audit and compliance')
ON CONFLICT (id) DO NOTHING;

INSERT INTO service_contracts (id, partner_id, contract_code, value_usd, start_date, end_date, status, description) VALUES
  ('demo-contract-1', 'demo-partner-1', 'CTR-2024-001', 2500000.00, '2024-01-15', '2025-01-14', 'active', 'Prime brokerage services agreement'),
  ('demo-contract-2', 'demo-partner-1', 'CTR-2024-002', 1800000.00, '2024-03-01', '2025-02-28', 'active', 'Extended brokerage contract'),
  ('demo-contract-3', 'demo-partner-1', 'CTR-2024-003', 3200000.00, '2024-06-01', '2026-05-31', 'active', 'Long-term brokerage agreement'),
  ('demo-contract-4', 'demo-partner-2', 'CTR-2024-004', 950000.00, '2024-02-10', '2025-02-09', 'active', 'Custody services contract'),
  ('demo-contract-5', 'demo-partner-2', 'CTR-2024-005', 1100000.00, '2024-07-15', '2025-07-14', 'active', 'Extended custody agreement'),
  ('demo-contract-6', 'demo-partner-3', 'CTR-2024-006', 750000.00, '2024-09-01', '2025-08-31', 'pending', 'Liquidity provision agreement'),
  ('demo-contract-7', 'demo-partner-4', 'CTR-2024-007', 180000.00, '2024-04-20', '2024-10-20', 'completed', 'Security audit contract')
ON CONFLICT (contract_code) DO NOTHING;

