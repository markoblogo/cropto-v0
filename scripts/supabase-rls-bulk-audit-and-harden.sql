-- Bulk audit + hardening for public tables exposed to PostgREST roles
-- Safe default: for any public table with anon/authenticated grants and no RLS,
-- enable+force RLS, revoke anon/authenticated grants, and create service_role-only policy.
--
-- NOTE:
-- - Run in Supabase SQL Editor as a privileged role.
-- - Review audit output first. Then execute hardening block.

-- 1) AUDIT
WITH public_tables AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
)
SELECT
  p.schema_name,
  p.table_name,
  p.rls_enabled,
  p.rls_forced,
  COALESCE(string_agg(DISTINCT g.grantee, ', ' ORDER BY g.grantee), 'none') AS api_grantees
FROM public_tables p
LEFT JOIN information_schema.role_table_grants g
  ON g.table_schema = p.schema_name
 AND g.table_name = p.table_name
 AND g.grantee IN ('anon', 'authenticated')
GROUP BY p.schema_name, p.table_name, p.rls_enabled, p.rls_forced
ORDER BY p.table_name;

-- 2) HARDEN (uncomment to apply)
DO $$
DECLARE
  r RECORD;
  policy_name TEXT;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      EXISTS (
        SELECT 1
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = n.nspname
          AND g.table_name = c.relname
          AND g.grantee IN ('anon', 'authenticated')
      ) AS has_api_grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
  LOOP
    IF r.has_api_grants AND NOT r.rls_enabled THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.table_name);
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.schema_name, r.table_name);
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated', r.schema_name, r.table_name);

      policy_name := format('service_role_only_%s', r.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, r.schema_name, r.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        policy_name,
        r.schema_name,
        r.table_name
      );

      RAISE NOTICE 'Hardened %.% (RLS enabled + revoked anon/authenticated + policy %)',
        r.schema_name, r.table_name, policy_name;
    END IF;
  END LOOP;
END
$$;
