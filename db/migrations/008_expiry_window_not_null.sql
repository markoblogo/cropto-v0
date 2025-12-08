ALTER TABLE options
  ALTER COLUMN expiry_window SET DEFAULT '',
  ALTER COLUMN expiry_window SET NOT NULL;

UPDATE options
SET expiry_window = ''
WHERE expiry_window IS NULL;

