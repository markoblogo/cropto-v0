# Last30Days Runbook

This runbook wires `/last30days` to real data from:

- `GET /api/market-dashboard` (always-on baseline)
- `last30days --emit=json --store` snapshots (optional enrichment)

## Required env (optional but recommended)

```bash
LAST30DAYS_JSON_PATH=/absolute/path/to/artifacts/last30days/latest.json
LAST30DAYS_SQLITE_PATH=/absolute/path/to/last30days.sqlite
```

If JSON is missing/empty and SQLite is configured, API falls back to SQLite reads.

## Refresh snapshots manually

```bash
npm run last30days:refresh
```

## Cron example

Run every 3 hours:

```cron
0 */3 * * * cd /path/to/cropto-v0 && LAST30DAYS_SCRIPT_PATH="$HOME/.agents/skills/last30days/scripts/last30days.py" npm run last30days:refresh >> /var/log/cropto-last30days.log 2>&1
```

## API smoke check

```bash
curl -sS "https://cropto.abvx.xyz/api/last30days/summary?days=30&region=all&lang=all" | head -c 1000
```
