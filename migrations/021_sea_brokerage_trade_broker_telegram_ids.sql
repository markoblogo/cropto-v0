ALTER TABLE sea_brokerage_entries
  ADD COLUMN IF NOT EXISTS trade_seller_broker_telegram_user_id text,
  ADD COLUMN IF NOT EXISTS trade_seller_broker_telegram_username text,
  ADD COLUMN IF NOT EXISTS trade_buyer_broker_telegram_user_id text,
  ADD COLUMN IF NOT EXISTS trade_buyer_broker_telegram_username text;
