-- Add lockedCollateral field to cropt_balances table
-- This tracks CROPT that is frozen as collateral for open options
-- Note: For demo, this column is optional - code computes lockedCollateral from options
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cropt_balances' AND column_name = 'locked_collateral'
    ) THEN
        ALTER TABLE cropt_balances 
        ADD COLUMN locked_collateral decimal(18, 8) NOT NULL DEFAULT '0';
    END IF;
END $$;

