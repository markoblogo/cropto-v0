-- Migration: prediction markets quality fields

alter table if exists macro_prediction_markets
  add column if not exists orderbook_spread_bps numeric(10,2),
  add column if not exists quality_score numeric(10,6),
  add column if not exists raw_outcomes text;
