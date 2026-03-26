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

For bilingual ingestion topics (EN + UKR):

```bash
LAST30DAYS_TOPICS="wheat prices black sea export||corn market outlook usda tenders"
LAST30DAYS_TOPICS_UK="ціни на пшеницю чорноморський експорт||кукурудза ринок прогноз тендери"
```

For Bluesky source:

```bash
BSKY_HANDLE=your.handle
BSKY_APP_PASSWORD=xxxx-xxxx-xxxx
```

`refresh_last30days.sh` now validates Bluesky auth (with retries). If auth fails, the script switches to a public Bluesky search fallback so the source remains partially available instead of dropping out entirely.

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
