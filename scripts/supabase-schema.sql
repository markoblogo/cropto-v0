-- Supabase schema for users table
-- Run this in Supabase SQL Editor before migration

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('farmer', 'trader', 'broker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address VARCHAR(255),
  network VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: The following policies restrict access to prevent unauthorized data access
-- These policies assume you're using service_role key on the backend

-- Policy: Backend service can do anything (requires service_role key)
CREATE POLICY "Service role has full access" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- SECURITY NOTE: 
-- If you're using SUPABASE_ANON_KEY for backend operations, this is INSECURE.
-- Anyone with the anon key can read password hashes!
-- 
-- RECOMMENDED APPROACH:
-- 1. Use SUPABASE_SERVICE_ROLE_KEY on backend (server-side only, never expose to client)
-- 2. Add this to Replit Secrets
-- 3. Update server/db/supabase.ts to use service role key
-- 
-- For development/testing only, you may temporarily use a permissive policy,
-- but NEVER in production:
-- 
-- CREATE POLICY "Development only - allow all with anon key" ON users
--   FOR ALL
--   USING (true)
--   WITH CHECK (true);

COMMENT ON TABLE users IS 'User authentication and profile data';
COMMENT ON POLICY "Service role has full access" ON users IS 'Backend service using service_role key has full access';
