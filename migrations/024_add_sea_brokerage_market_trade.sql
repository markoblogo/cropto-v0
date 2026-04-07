-- Migration: Add is_market_trade column to sea_brokerage_entries
-- Added: 2026-04-07

ALTER TABLE sea_brokerage_entries ADD COLUMN IF NOT EXISTS is_market_trade BOOLEAN NOT NULL DEFAULT FALSE;
