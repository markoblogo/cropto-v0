# Ingestion Triage (BR/AR/US)

## Probe snapshot
Source: `npm run ingest:probe` run on 2026-02-19.

| market | vendors tried | latest asOf found | wrote to DB | notes |
|---|---|---|---|---|
| BR | CLAL (TESEO), COMMODITY3, GRAINSPRICES | yes (CLAL showed 2026-02-19) | not verified in this run | parser responses are healthy; DB write requires ingestion job run with DATABASE_URL |
| AR | CLAL (TESEO), BCR, GRAINSPRICES | yes (CLAL showed 2026-02-19; BCR 2026-02-18) | not verified in this run | parser responses are healthy; likely runtime/scheduler/env issue if prod remains empty |
| US | CLAL (TESEO), FSGRAIN, GRAINSPRICES | yes (CLAL showed 2026-02-19) | not verified in this run | if UI shows stale/mock, check runtime/db-check endpoints and scheduler service wiring |

## Smoke constraints observed
- `npm run ingest:smoke` currently fails locally when `DATABASE_URL` is missing.
- This indicates environment setup issue, not parser parsing issue.

## Recommended prod diagnosis order
1. `GET /api/version` (confirm deployed SHA)
2. `GET /api/admin/market-ingestion/runtime`
3. `GET /api/admin/market-ingestion/db-check`
4. `POST /api/admin/market-ingestion/run-now?market=BR` and re-check dashboard payload
