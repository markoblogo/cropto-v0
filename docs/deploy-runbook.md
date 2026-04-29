# Railway Deploy Runbook

## When to run
Use this when `/api/version` on `https://cr0pto.com` does not match the latest commit on `release/demo`.

## Target state
- Railway web service is built from `release/demo`.
- `GET /api/version` returns latest `gitSha`.
- `GET /api/market-dashboard?debugSources=1` reflects recent backend changes.

## Steps
1. Open Railway project and locate the **web** service (the one running `npm start` / `dist/index.js`).
2. Ensure source is connected to GitHub repo `markoblogo/cropto-v0` and branch `release/demo`.
3. Trigger deploy:
   - either push to `release/demo`, or
   - click **Redeploy** on latest deployment for the web service.
4. Wait for deployment to reach healthy state.
5. Verify:
   - `curl -sS https://cr0pto.com/api/version`
   - confirm `gitSha` equals latest `release/demo` commit.
6. If jobs run as separate service, redeploy **jobs** service too (running `npm run start:jobs`).

## Mandatory env checks
- `DATABASE_URL` set for both web and jobs services.
- `ENABLE_MARKET_INGESTION` not set to `false`.
- `START_INGESTION_SCHEDULER=1` on web service (unless ingestion runs in dedicated jobs service).
- `ALLOW_DEMO_DATA` should be unset or `0` in production.
- `INGESTION_DISABLE_PRIMARY` should be unset unless doing controlled failover testing.

## 2-minute verification (curl)
1. `curl -sS https://cr0pto.com/api/version`
2. `curl -sS -H "Authorization: Bearer <admin_token>" https://cr0pto.com/api/admin/market-ingestion/runtime`
3. `curl -sS -H "Authorization: Bearer <admin_token>" https://cr0pto.com/api/admin/market-ingestion/db-check`
4. `curl -sS -X POST -H "Authorization: Bearer <admin_token>" "https://cr0pto.com/api/admin/market-ingestion/run-now?market=BR"`
5. `curl -sS "https://cr0pto.com/api/market-dashboard?debugSources=1"`

Expected:
- `/api/version` SHA equals `release/demo` HEAD.
- runtime => `ingestion.schedulerRunning=true`, `dbConnected=true`, `dbSchemaOk=true`.
- db-check => table status `db_ok` and `marketSummary` shows BR/AR/US counts.
- run-now => `result.upserted > 0` (or clear sanitized failure reason + vendor list).
- dashboard debug => BR/AR/US use real providers when rows exist; mock appears only when demo mode is explicitly allowed.
