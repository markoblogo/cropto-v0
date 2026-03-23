-- Migration: 018_global_index_snapshot

CREATE TABLE IF NOT EXISTS global_index_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  value NUMERIC(20,8),
  day_change_pct NUMERIC(12,6),
  source TEXT NOT NULL DEFAULT 'eod',
  status TEXT NOT NULL DEFAULT 'INDICATIVE',
  extra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS global_index_snapshot_ts_idx
  ON global_index_snapshot (ts DESC);

CREATE INDEX IF NOT EXISTS global_index_snapshot_symbol_idx
  ON global_index_snapshot (symbol, ts DESC);

