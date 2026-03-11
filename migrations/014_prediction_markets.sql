-- Migration: prediction markets persistence and risk timeseries

create table if not exists macro_prediction_markets (
  id text primary key,
  source text not null,
  market_type text not null default 'binary',
  question text not null,
  description text,
  category text not null default 'other',
  tags text,
  region text not null default 'GLOBAL',
  implied_probability numeric(10,6),
  yes_price numeric(10,6),
  no_price numeric(10,6),
  volume_24h numeric(20,4),
  open_interest numeric(20,4),
  liquidity_score numeric(10,6),
  status text not null default 'open',
  close_time timestamptz,
  resolve_time timestamptz,
  raw text,
  scraped_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists macro_prediction_markets_category_idx on macro_prediction_markets (category);
create index if not exists macro_prediction_markets_region_idx on macro_prediction_markets (region);
create index if not exists macro_prediction_markets_status_idx on macro_prediction_markets (status);
create index if not exists macro_prediction_markets_updated_idx on macro_prediction_markets (updated_at desc);

create table if not exists macro_risk_timeseries (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  source text not null default 'prediction_markets',
  index_name text not null,
  region text not null default 'GLOBAL',
  value numeric(10,6) not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists macro_risk_timeseries_idx on macro_risk_timeseries (index_name, region, ts desc);
