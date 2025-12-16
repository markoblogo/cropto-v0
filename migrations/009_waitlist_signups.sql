-- Create waitlist_signups table for early-access waitlist
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Basic index to help lookups by email (uniqueness handled at app level)
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_email ON waitlist_signups(email);
