-- Make users.role accept broker/admin/super_admin values (text for flexibility)
DO $$
BEGIN
  -- Ensure column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'role'
  ) THEN
    -- Drop check constraint if any
    PERFORM 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'users'
      AND ccu.column_name = 'role'
      AND tc.constraint_type = 'CHECK';
    IF FOUND THEN
      EXECUTE (
        SELECT 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(tc.constraint_name)
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'users'
          AND ccu.column_name = 'role'
          AND tc.constraint_type = 'CHECK'
        LIMIT 1
      );
    END IF;

    -- Widen type to TEXT to avoid enum errors
    ALTER TABLE public.users
      ALTER COLUMN role TYPE text USING role::text,
      ALTER COLUMN role SET DEFAULT 'USER';
  END IF;
END $$;


