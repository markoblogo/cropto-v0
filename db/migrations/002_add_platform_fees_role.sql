-- Migration: Add role column to platform_fees table
-- Version: 002
-- Description: Add role column to platform_fees to match Drizzle schema

-- Create platform_fees table if it doesn't exist (for new installations)
CREATE TABLE IF NOT EXISTS platform_fees (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CROPT',
    instrument TEXT,
    tx_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add role column if it doesn't exist
ALTER TABLE platform_fees
  ADD COLUMN IF NOT EXISTS role TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_platform_fees_user_id ON platform_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_type ON platform_fees(type);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created_at ON platform_fees(created_at);

