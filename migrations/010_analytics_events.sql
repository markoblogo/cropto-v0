CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
