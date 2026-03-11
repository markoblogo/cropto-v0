-- Migration: binance market snapshot persistence

create table if not exists binance_market_snapshot (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  venue text not null default 'binance',
  symbol text not null,
  asset_type text not null,
  underlying text,
  price numeric(20,8),
  price_change_24h_pct numeric(12,6),
  volume_24h numeric(24,8),
  open_interest numeric(24,8),
  implied_volatility numeric(12,6),
  source text not null,
  status text not null default 'INDICATIVE',
  extra text,
  created_at timestamptz not null default now()
);

create index if not exists binance_market_snapshot_ts_idx on binance_market_snapshot (ts desc);
create index if not exists binance_market_snapshot_symbol_idx on binance_market_snapshot (symbol, ts desc);
