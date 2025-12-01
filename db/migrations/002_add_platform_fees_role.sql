-- Migration: Add role column to platform_fees table
-- Version: 002
-- Description: Add role column to platform_fees to match Drizzle schema

-- First, ensure platform_fees table exists with all required columns
-- Handle case where table might exist but be missing columns
DO $$ 
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'platform_fees'
    ) THEN
        CREATE TABLE platform_fees (
            id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            user_id TEXT NOT NULL,
            fee_type TEXT NOT NULL,
            amount DECIMAL(18, 8) NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CROPT',
            instrument TEXT,
            tx_id TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    ELSE
        -- Table exists, add missing columns one by one
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'platform_fees' AND column_name = 'fee_type'
        ) THEN
            ALTER TABLE platform_fees ADD COLUMN fee_type TEXT NOT NULL DEFAULT 'option_create';
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'platform_fees' AND column_name = 'amount'
        ) THEN
            ALTER TABLE platform_fees ADD COLUMN amount DECIMAL(18, 8) NOT NULL DEFAULT '0';
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'platform_fees' AND column_name = 'currency'
        ) THEN
            ALTER TABLE platform_fees ADD COLUMN currency TEXT NOT NULL DEFAULT 'CROPT';
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'platform_fees' AND column_name = 'instrument'
        ) THEN
            ALTER TABLE platform_fees ADD COLUMN instrument TEXT;
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'platform_fees' AND column_name = 'tx_id'
        ) THEN
            ALTER TABLE platform_fees ADD COLUMN tx_id TEXT;
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'platform_fees' AND column_name = 'created_at'
        ) THEN
            ALTER TABLE platform_fees ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW();
        END IF;
    END IF;
    
    -- Add role column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'platform_fees' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE platform_fees ADD COLUMN role TEXT;
    END IF;
END $$;

-- Add indexes for better query performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_platform_fees_user_id ON platform_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_fee_type ON platform_fees(fee_type);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created_at ON platform_fees(created_at);

