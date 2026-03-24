create table if not exists sea_brokerage_entries (
  id varchar primary key default gen_random_uuid(),
  type text not null check (type in ('bid', 'offer')),
  broker_user_id text not null,
  broker_email text,
  broker_code text not null,
  broker_name text not null,
  company_name text not null,
  seller_name text,
  buyer_name text,
  origin_country text,
  origin_country_code text,
  commodity text not null,
  commodity_label text not null,
  grade_or_spec text not null default '',
  quantity_mt integer,
  tolerance_pct integer,
  volume_from integer not null,
  volume_to integer not null,
  volume_unit text not null default 'mt',
  basis text not null,
  payment_terms text,
  destination_port_code text,
  destination_port text not null,
  destination_country_code text,
  destination_country text not null,
  period_type text not null,
  period_label text not null,
  period_start text,
  period_end text,
  price numeric(18,4),
  price_from numeric(18,4),
  price_to numeric(18,4),
  currency text not null default 'USD',
  transport_type text not null,
  note text,
  canonical_view text not null,
  telegram_relay_status text not null default 'queued' check (telegram_relay_status in ('queued', 'published', 'failed')),
  telegram_relay_message text,
  telegram_message_id text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists sea_brokerage_entries_created_at_idx
  on sea_brokerage_entries (created_at desc);

create index if not exists sea_brokerage_entries_type_idx
  on sea_brokerage_entries (type);

create index if not exists sea_brokerage_entries_broker_user_id_idx
  on sea_brokerage_entries (broker_user_id);
