# Sea Brokerage Monitor Railway Runbook

Use this when enabling or verifying live Sea Brokerage Monitor publishing flow:

- authenticated `Create BID` / `Create OFFER`
- backend persistence in `sea_brokerage_entries`
- Telegram relay posting to broker chats

## 1) Branch and deploy target

Current deployment convention:

- repo default branch: `main`
- active Railway web deploy branch may still be `release/demo`

Before rollout, verify what Railway service is tracking and deploy the branch containing:

- `migrations/019_sea_brokerage_entries.sql`
- server routes `/api/sea-brokerage-monitor/entries`
- `server/services/seaBrokerageTelegramPublisher.ts`

## 2) Required env on Railway web service

Set these on the **web** service:

- `DATABASE_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `SEA_BROKERAGE_TELEGRAM_CHAT_ID`

Optional but recommended:

- `SEA_BROKERAGE_TELEGRAM_CHAT_IDS` (comma-separated list)
- `SEA_BROKERAGE_TELEGRAM_UA_CHAT_ID` (country-specific routing for UA-origin entries)

## 3) Apply migration 019

Apply DB migration before relying on monitor create flow:

```bash
psql "$DATABASE_URL" -f migrations/019_sea_brokerage_entries.sql
```

Quick table existence check:

```bash
psql "$DATABASE_URL" -c "\d+ sea_brokerage_entries"
```

## 4) Deploy web service

1. Trigger a deploy in Railway (push or Redeploy).
2. Wait for healthy status.
3. Verify backend SHA:

```bash
curl -sS https://cropto.abvx.xyz/api/version
```

## 5) Smoke test monitor API

### List entries (public view path)

```bash
curl -sS https://cropto.abvx.xyz/api/sea-brokerage-monitor/entries
```

Expected: JSON array.

### Create entry (auth required)

```bash
export TOKEN="<broker_jwt>"
curl -sS -X POST https://cropto.abvx.xyz/api/sea-brokerage-monitor/entries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"bid",
    "brokerCode":"SK",
    "brokerName":"Sergiy Kozhushkin",
    "companyName":"Southline Brokerage",
    "buyerName":"ACU Trade",
    "originCountry":"Ukraine",
    "originCountryCode":"UA",
    "commodity":"wheat_115",
    "commodityLabel":"Wheat 11.5%",
    "gradeOrSpec":"",
    "quantityMt":15000,
    "tolerancePct":5,
    "volumeFrom":14250,
    "volumeTo":15750,
    "volumeUnit":"mt",
    "basis":"CPT",
    "paymentTerms":"CAD",
    "destinationPortCode":"pivdennyi",
    "destinationPort":"Pivdennyi",
    "destinationCountryCode":"UA",
    "destinationCountry":"Ukraine",
    "periodType":"range",
    "periodLabel":"20.03.26-30.04.26",
    "periodStart":"2026-03-20",
    "periodEnd":"2026-04-30",
    "price":214,
    "priceFrom":214,
    "priceTo":214,
    "currency":"USD",
    "transportType":"truck",
    "note":"test relay",
    "canonicalView":"23.03 / 12:02 / SK / WHEAT 11,5 15'\''000 CPT UAYUZ 20/03-30/04 @ 214$"
  }'
```

Expected:

- `201` JSON response
- persisted entry appears in `GET /api/sea-brokerage-monitor/entries`
- `telegramRelayStatus` returns `published` when bot + chat config are valid

## 6) Telegram delivery checks

If relay status is `failed`, verify:

1. Bot token validity (`TELEGRAM_BOT_TOKEN`).
2. Bot membership in target chat/group.
3. Correct chat id (`SEA_BROKERAGE_TELEGRAM_CHAT_ID`).
4. No Telegram API restrictions for that bot/chat.

## 7) Common rollback-safe fallback

If Telegram relay is unstable, keep monitor persistence enabled and temporarily treat relay failures as non-blocking operational warnings while debugging bot/chat configuration.
