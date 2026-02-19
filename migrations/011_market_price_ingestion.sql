-- Migration: market price ingestion tables

create table if not exists market_prices (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  commodity text not null,
  category text not null default 'other',
  variant text,
  raw_commodity text,
  basis text,
  unit text not null,
  price numeric(18,8) not null,
  price_usd_per_ton numeric(18,8),
  as_of timestamp not null,
  fetched_at timestamp not null default now(),
  provider text not null,
  source_url text not null,
  source_layer text not null default 'primary',
  confidence numeric(5,4),
  freshness_status text not null default 'fresh',
  needs_review text not null default 'false',
  raw_meta text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create unique index if not exists market_prices_uni_idx on market_prices(market, commodity, provider, as_of);
create index if not exists market_prices_market_idx on market_prices(market, commodity, as_of desc);

create table if not exists market_price_fetch_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  market text not null,
  commodity text not null,
  source_url text not null,
  source_layer text not null default 'primary',
  status text not null,
  status_code integer,
  latency_ms integer,
  point_count integer not null default 0,
  confidence numeric(5,4),
  as_of timestamp,
  error text,
  created_at timestamp not null default now()
);

create index if not exists market_price_fetch_log_recent_idx on market_price_fetch_log(provider, market, commodity, created_at desc);

create table if not exists market_price_source_status (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  market text not null,
  commodity text not null,
  source_layer text not null default 'primary',
  source_url text not null,
  freshness_status text not null default 'failed',
  last_fetched_at timestamp,
  last_success_at timestamp,
  last_as_of timestamp,
  last_latency_ms integer,
  confidence numeric(5,4),
  last_error text,
  updated_at timestamp not null default now()
);

create unique index if not exists market_price_source_status_uni_idx
  on market_price_source_status(provider, market, commodity, source_layer);
