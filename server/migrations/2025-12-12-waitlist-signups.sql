-- Migration: create waitlist_signups table (early-access waitlist)
-- Note: relies on pgcrypto (gen_random_uuid) already used elsewhere in project.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp NOT NULL DEFAULT now(),
  user_id text,
  name text NOT NULL,
  email text NOT NULL,
  country text NOT NULL,
  role text NOT NULL,
  company text NOT NULL,
  linkedin_url text,
  website_url text,
  source text NOT NULL DEFAULT 'hero',
  verification_token text,
  verified_at timestamp
);


