-- Add optional on-chain transaction hash to transactions for soft-proof linking
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS onchain_tx_hash text;
