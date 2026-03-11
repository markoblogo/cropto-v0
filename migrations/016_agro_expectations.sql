-- Migration: agro expectations persistence tables

create table if not exists cgo_weights (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  region text not null default 'GLOBAL',
  commodity text not null,
  weight numeric(12,8) not null,
  source text not null default 'seed',
  meta text,
  updated_at timestamptz not null default now()
);

create unique index if not exists cgo_weights_unique_idx on cgo_weights (year, region, commodity);
create index if not exists cgo_weights_region_idx on cgo_weights (region, year desc);

create table if not exists agro_composite_timeseries (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  source text not null default 'agro_expectations',
  index_name text not null,
  region text not null default 'GLOBAL',
  value numeric(14,6) not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists agro_composite_timeseries_idx on agro_composite_timeseries (index_name, region, ts desc);
