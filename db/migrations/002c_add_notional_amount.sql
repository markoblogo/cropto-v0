-- Migration: Add notional_amount column to platform_fees table
-- Version: 002c
-- Description: Add notional_amount column to track the underlying notional value for fees

-- Add notional_amount column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'platform_fees' 
        AND column_name = 'notional_amount'
    ) THEN
        ALTER TABLE platform_fees 
        ADD COLUMN notional_amount DECIMAL(18, 8) NOT NULL DEFAULT '0';
    END IF;
END $$;

-- Backfill existing rows with NULL notional_amount (set to 0 for old dev data)
UPDATE platform_fees 
SET notional_amount = '0' 
WHERE notional_amount IS NULL;

