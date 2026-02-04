-- Cleanup script for old IGC records
-- Creates backup and removes all IGC records from index_prices table

-- Step 1: Create backup of all IGC records
CREATE TABLE IF NOT EXISTS index_prices_backup_igc AS
SELECT *
FROM index_prices
WHERE source = 'IGC';

-- Step 2: Delete all current IGC records
DELETE FROM index_prices
WHERE source = 'IGC';

-- Step 3: Verify deletion (should return 0)
SELECT COUNT(*) as remaining_igc_records
FROM index_prices
WHERE source = 'IGC';

