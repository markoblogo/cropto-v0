# Railway Deploy Runbook

## When to run
Use this when `/api/version` on `https://cropto.abvx.xyz` does not match the latest commit on `release/demo`.

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
   - `curl -sS https://cropto.abvx.xyz/api/version`
   - confirm `gitSha` equals latest `release/demo` commit.
6. If jobs run as separate service, redeploy **jobs** service too (running `npm run start:jobs`).

## Mandatory env checks
- `DATABASE_URL` set for both web and jobs services.
- `ENABLE_MARKET_INGESTION` not set to `false`.
- `ALLOW_DEMO_DATA` should be unset or `0` in production.
- `INGESTION_DISABLE_PRIMARY` should be unset unless doing controlled failover testing.

## Post-deploy smoke
- `GET /api/market-dashboard?debugSources=1`
- `GET /api/admin/market-ingestion/runtime` (admin/broker token)
- `GET /api/admin/market-ingestion/db-check` (admin/broker token)
