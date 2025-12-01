-- Migration: Rename type column to fee_type in platform_fees table
-- Version: 002b
-- Description: Fix column name mismatch - DB expects fee_type, not type

-- Rename type column to fee_type if it exists and fee_type doesn't exist
DO $$ 
BEGIN
    -- Check if 'type' column exists and 'fee_type' doesn't
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'platform_fees' 
        AND column_name = 'type'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'platform_fees' 
        AND column_name = 'fee_type'
    ) THEN
        ALTER TABLE platform_fees RENAME COLUMN type TO fee_type;
    END IF;
    
    -- If neither exists, add fee_type (shouldn't happen, but safe)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'platform_fees' 
        AND column_name = 'fee_type'
    ) THEN
        ALTER TABLE platform_fees ADD COLUMN fee_type TEXT NOT NULL DEFAULT 'option_create';
    END IF;
END $$;

-- Update index if it references the old column name
DROP INDEX IF EXISTS idx_platform_fees_type;
CREATE INDEX IF NOT EXISTS idx_platform_fees_fee_type ON platform_fees(fee_type);

