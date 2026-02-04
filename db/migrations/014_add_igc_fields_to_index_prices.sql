-- Cropto Database Schema Migration
-- Version: 014_add_igc_fields_to_index_prices
-- Description: Add IGC-specific fields to index_prices table for IGC price parsing

-- Add country field (ISO code: US, BR, AR)
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS country TEXT;

-- Add label field (full description from IGC, e.g., "US No 2 Hard Red Winter (HRW)")
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS label TEXT;

-- Add as_of_date field (ISO date string: yyyy-mm-dd)
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS as_of_date DATE;

-- Add daily_change_pct field (percentage change)
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS daily_change_pct DECIMAL(10, 4);

-- Add annual_change_pct field (percentage change)
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS annual_change_pct DECIMAL(10, 4);

-- Add 52-week low field
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS low_52w DECIMAL(18, 8);

-- Add 52-week high field
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS high_52w DECIMAL(18, 8);

-- Add raw_row field (JSONB for storing all columns from IGC table)
ALTER TABLE index_prices ADD COLUMN IF NOT EXISTS raw_row JSONB;

-- Update source default for IGC data (will be set to 'IGC' when inserted via IGC service)
-- Note: source field already exists, we just ensure it can be 'IGC'

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_index_prices_country ON index_prices(country);
CREATE INDEX IF NOT EXISTS idx_index_prices_country_commodity ON index_prices(country, commodity);
CREATE INDEX IF NOT EXISTS idx_index_prices_as_of_date ON index_prices(as_of_date);
CREATE INDEX IF NOT EXISTS idx_index_prices_source ON index_prices(source);

-- Add comment
COMMENT ON COLUMN index_prices.country IS 'ISO country code (US, BR, AR) for IGC data';
COMMENT ON COLUMN index_prices.label IS 'Full label from IGC table (e.g., "US No 2 Hard Red Winter (HRW)")';
COMMENT ON COLUMN index_prices.as_of_date IS 'Date of price data (ISO format: yyyy-mm-dd)';
COMMENT ON COLUMN index_prices.raw_row IS 'Raw row data from IGC table as JSONB';

