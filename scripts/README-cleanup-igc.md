# Cleanup Old IGC Records

This script cleans up old IGC records from the database that have incorrect commodity-label mappings.

## Usage

1. **Connect to your database** (via psql, Supabase SQL editor, or your preferred PostgreSQL client)

2. **Run the cleanup script**:

```sql
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
```

3. **Run the IGC poller** to populate with correct data:

```bash
npx tsx server/jobs/igcPoller.ts
```

4. **Verify the results**:

```bash
npm run debug:igc
```

Expected result: Only 10 correct records should be present:
- BR: soybeans 414, maize 222
- AR: wheat 212, maize 218, barley 213, soybeans 401
- US: wheat 239, maize 214, soybeans 417

No AR rice, no duplicate HRW/SRW in other commodities.

## Recovery

If you need to restore the backup:

```sql
-- Restore from backup
INSERT INTO index_prices
SELECT * FROM index_prices_backup_igc;

-- Or drop the backup table if you're sure you don't need it
-- DROP TABLE IF EXISTS index_prices_backup_igc;
```

