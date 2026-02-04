-- Audit public-table exposure and RLS state
-- Run in Supabase SQL editor

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

-- Existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
