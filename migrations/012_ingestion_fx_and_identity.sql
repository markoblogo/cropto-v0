-- Migration: ingestion FX normalization + provider identity cleanup

alter table if exists market_prices add column if not exists price_raw numeric(18,8);
alter table if exists market_prices add column if not exists raw_unit text;
alter table if exists market_prices add column if not exists raw_currency text;
alter table if exists market_prices add column if not exists raw_to_usd_fx_rate numeric(20,10);
alter table if exists market_prices add column if not exists conversion_notes text;
alter table if exists market_prices add column if not exists channel text default 'HTML_PAGE';

alter table if exists market_price_fetch_log add column if not exists channel text default 'HTML_PAGE';
alter table if exists market_price_source_status add column if not exists channel text default 'HTML_PAGE';

drop index if exists market_prices_uni_idx;
create unique index if not exists market_prices_uni_idx on market_prices(market, commodity, basis, as_of);

drop index if exists market_price_source_status_uni_idx;
create unique index if not exists market_price_source_status_uni_idx on market_price_source_status(provider, channel, market, commodity, source_layer);

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  currency text not null,
  usd_per_unit numeric(20,10) not null,
  source text not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);
create unique index if not exists fx_rates_uni_idx on fx_rates(as_of, currency, source);
