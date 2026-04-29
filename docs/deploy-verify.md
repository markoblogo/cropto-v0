# Deployment Verification (2 minutes)

Use this after each Railway deploy to confirm `cr0pto.com` is serving the expected backend build.

## 0) Expected SHA

Get expected SHA from git:

```bash
git rev-parse origin/release/demo
```

## 0.1) Legacy domain redirect must preserve path

```bash
curl -i -sS https://cropto.abvx.xyz/monitor | head -n 20
```

Expected:
- `301`
- `location: https://cr0pto.com/monitor`

## 1) Version endpoint must be JSON and match SHA

```bash
curl -i -sS https://cr0pto.com/api/version
```

Expected:
- `HTTP/2 200`
- `content-type: application/json...`
- JSON body with `gitSha`, `buildTime`, `env`
- `gitSha` equals expected commit SHA

## 2) Dashboard API must return JSON (not SPA HTML)

```bash
curl -i -sS "https://cr0pto.com/api/market-dashboard?debugSources=1" | head -n 30
```

Expected:
- `content-type: application/json...`
- body starts with `{` (JSON), not `<!DOCTYPE html>`

## 3) Admin ingestion endpoints auth behavior

Without auth:

```bash
curl -i -sS https://cr0pto.com/api/admin/market-ingestion/runtime | head -n 20
curl -i -sS https://cr0pto.com/api/admin/market-ingestion/db-check | head -n 20
```

Expected:
- `401` (or `403` if token exists but role insufficient)
- JSON response (not HTML)

With auth:

```bash
export TOKEN="<admin_or_broker_jwt>"
curl -i -sS -H "Authorization: Bearer $TOKEN" https://cr0pto.com/api/admin/market-ingestion/runtime | head -n 40
curl -i -sS -H "Authorization: Bearer $TOKEN" https://cr0pto.com/api/admin/market-ingestion/db-check | head -n 60
```

Expected:
- `200`
- JSON payload

## 4) Healthz quick state

```bash
curl -i -sS https://cr0pto.com/api/healthz
```

Expected JSON:
- `ok=true`
- `gitSha`
- `dbConnected=true`
- `migrationsOk=true`
- `schedulerRunning=true` (or false if intentionally disabled)

## 5) Header checks for API responses

All `/api/*` responses should include:
- `X-Cropto-GitSha`
- `X-Cropto-BuildTime`

Example:

```bash
curl -i -sS https://cr0pto.com/api/version | rg -n "X-Cropto-GitSha|X-Cropto-BuildTime|content-type|HTTP/"
```

## Common failure modes

- **SPA HTML fallback on `/api/*`**
  - symptom: `content-type: text/html` and body starts with `<!DOCTYPE html>`
  - meaning: wrong route precedence, stale deploy, or API 404 is being served by static frontend
- **Wrong SHA**
  - symptom: `/api/version.gitSha` differs from git expected SHA
  - meaning: Railway deploy did not pick latest commit/branch
- **Wrong content type**
  - symptom: JSON endpoint returns non-JSON content-type
  - meaning: proxy/routing mismatch or static fallback
