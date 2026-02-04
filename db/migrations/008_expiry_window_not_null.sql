-- 008_expiry_window_not_null.sql
-- Backfill existing NULL values before enforcing NOT NULL

-- В демо-данных просто проставляем дефолтное окно экспирации,
-- чтобы не падать на уже существующих строках.
UPDATE options
SET expiry_window = '3M'
WHERE expiry_window IS NULL;

ALTER TABLE options
  ALTER COLUMN expiry_window SET NOT NULL;