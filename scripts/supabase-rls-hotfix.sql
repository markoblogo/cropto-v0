-- Emergency hardening for accidental backup table exposure
-- Target: public.tmp_users_policy_backup
-- Run in Supabase SQL editor

BEGIN;

ALTER TABLE IF EXISTS public.tmp_users_policy_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tmp_users_policy_backup FORCE ROW LEVEL SECURITY;

-- Block direct API access
REVOKE ALL ON TABLE IF EXISTS public.tmp_users_policy_backup FROM anon, authenticated;

DROP POLICY IF EXISTS "service_role_only_tmp_users_policy_backup" ON public.tmp_users_policy_backup;
CREATE POLICY "service_role_only_tmp_users_policy_backup"
  ON public.tmp_users_policy_backup
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
