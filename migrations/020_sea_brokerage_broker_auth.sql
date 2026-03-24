create table if not exists sea_brokerage_broker_auth (
  id varchar primary key default gen_random_uuid(),
  auth_user_id text,
  auth_email text,
  telegram_user_id text,
  telegram_username text,
  broker_code text not null,
  broker_name text not null,
  company_name text not null,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create unique index if not exists sea_brokerage_broker_auth_auth_user_id_uq
  on sea_brokerage_broker_auth (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists sea_brokerage_broker_auth_auth_email_uq
  on sea_brokerage_broker_auth (lower(auth_email))
  where auth_email is not null;

create unique index if not exists sea_brokerage_broker_auth_telegram_user_id_uq
  on sea_brokerage_broker_auth (telegram_user_id)
  where telegram_user_id is not null;

create unique index if not exists sea_brokerage_broker_auth_telegram_username_uq
  on sea_brokerage_broker_auth (lower(telegram_username))
  where telegram_username is not null;

alter table sea_brokerage_entries
  add column if not exists broker_telegram_user_id text;

alter table sea_brokerage_entries
  add column if not exists broker_telegram_username text;
