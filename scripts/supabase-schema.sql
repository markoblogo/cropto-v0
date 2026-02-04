-- Supabase users schema (hardened)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('farmer', 'trader', 'broker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address VARCHAR(255),
  network VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Do not expose password-hash table via API roles
REVOKE ALL ON TABLE public.users FROM anon, authenticated;

DROP POLICY IF EXISTS "Service role has full access" ON public.users;
CREATE POLICY "Service role has full access" ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.users IS 'User authentication and profile data (backend-only via service_role)';
COMMENT ON POLICY "Service role has full access" ON public.users IS 'Backend service using service_role key has full access';
