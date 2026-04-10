# Cropto

[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cropto is an early-stage platform for commodity trading, market monitoring, and brokerage workflows.

This repository contains the active MVP codebase: the main web app, backend APIs/jobs, ingestion pipelines, and the operational Sea Brokerage Monitor used for BID/OFFER/TRADE workflows.

## Project Status

- Product state: active prototype/staging with real partner usage in selected modules
- Main staging domain: [cropto.abvx.xyz](https://cropto.abvx.xyz)
- Maturity: mixed (some modules are production-like operationally, others remain experimental)

## Key Product Areas

- Trading/monitoring surfaces in the main Cropto app
- Market dashboard and market-data ingestion layers
- Sea Brokerage Monitor at `/spike-monitor`
- Broker auth/session and Telegram relay flows for monitor operations
- Operational/reporting modules (daily reports, export, analytics, sheets sync)

## Current Feature Highlights

- Route-level product shell and dashboard surfaces for market and workflow monitoring
- Sea Brokerage Monitor dual-pane workspace (`OFFERS` / `BIDS`) with `MATCHES` and `TRADES`
- Compact tape rows + structured detail modal/drawer flows
- Create/edit/repost flows for BID/OFFER/TRADE records
- Broker gating with Telegram-based monitor auth flow
- Server-side persistence for monitor entries and related dictionaries
- Telegram publishing for entries, matches, and reports
- Basis-aware routing for SEA/LAND telegram channels
- Daily market-report scheduler and custom report profiles
- Google Sheets sync path for monitor records/dictionaries

## Sea Brokerage Monitor

Sea Brokerage Monitor is the most actively evolving operational module in this repository.

### Purpose

- Fast broker workflow for creating and scanning BID/OFFER/TRADE ideas
- Rolling matching visibility
- Structured operational relay into Telegram channels

### Current UX shape

- Top global filter row (commodity, origin, basis, delivery place, business unit, currency, transport type, broker, search)
- Dual-pane `OFFERS` and `BIDS`
- `MATCHES` and `TRADES` operational blocks
- Secondary Views (`Tape`, `Archive`, `Analytics`) with exports/reporting

### Current backend/ops shape

- API-backed persistence for monitor entries
- Monitor-specific Telegram auth/session path
- Telegram relay publisher + scheduled daily reports
- Sheets sync scheduler for monitor data sync
- Dictionary import tooling from Google Sheets

## Repository Structure

```text
.
├── client/        # React frontend (routes, shared UI, feature modules)
├── server/        # Express API, monitor services, schedulers, ingestion jobs
├── shared/        # Shared schema/types between client and server
├── db/            # DB connection/helpers
├── migrations/    # SQL migration files
├── scripts/       # Operational scripts (smoke, import, backfill, diagnostics)
├── docs/          # Internal product/deploy/runbook documentation
├── public/        # Public static assets
├── tests/         # Test and verification assets
├── railway.json   # Railway deployment config
└── package.json
```

### Notable monitor paths

- `client/src/features/sea-brokerage-monitor/`
- `server/monitor/`
- `server/services/seaBrokerage*.ts`
- `scripts/sea_brokerage_*.ts`

## Tech Stack

### Frontend

- React 18 + TypeScript
- Vite
- Wouter
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS + Radix UI primitives
- Recharts

### Backend

- Node.js 22
- Express
- TypeScript
- Drizzle ORM
- PostgreSQL
- Zod
- Session/JWT auth primitives

### Integrations and ops

- Telegram bot integration (auth/relay/reporting paths)
- Supabase integration hooks
- Railway deployment
- Playwright smoke tooling

## Local Development

### Prerequisites

- Node.js `22.x`
- PostgreSQL-compatible database
- npm

### Setup

```bash
npm install
cp .env.example .env
```

### Required minimum env

- `DATABASE_URL`
- `SESSION_SECRET`
- `JWT_SECRET`

For monitor auth/relay work, also configure:

- `TELEGRAM_BOT_TOKEN`
- `SEA_BROKERAGE_MONITOR_JWT_SECRET`
- `VITE_SEA_BROKERAGE_TELEGRAM_BOT_USERNAME`
- monitor relay/chat vars from `.env.example`

### DB and run

```bash
npm run db:push
npm run dev
```

Run jobs/schedulers in parallel when needed:

```bash
npm run dev:jobs
```

### Build and checks

```bash
npm run build
npm run check
```

Useful operational scripts:

```bash
npm run sea-brokerage:telegram:smoke
npm run sea-brokerage:dictionaries:import
npm run e2e:smoke
```

## Environment and Configuration

`.env.example` documents active configuration areas:

- Core app/session/db
- Supabase integration
- On-chain settings
- Ingestion/poller settings
- Telegram monitor auth/relay/reporting settings
- Last30days ingestion toggles

Not all env keys are required for every route/module. Configure by feature scope.

## Deployment / Hosting

- Primary deployment target: Railway (`railway.json`)
- Main docs:
  - [`docs/deploy-runbook.md`](docs/deploy-runbook.md)
  - [`docs/sea-brokerage-monitor-railway-runbook.md`](docs/sea-brokerage-monitor-railway-runbook.md)
  - [`docs/sea-brokerage-telegram-partner-handoff.md`](docs/sea-brokerage-telegram-partner-handoff.md)

## Current Limitations / Work in Progress

- Product maturity remains uneven across modules
- Some features are stable operationally but still evolving in UX/format standards
- Telegram and dictionary/reporting logic is active but still frequently iterated with broker feedback
- Deployment/runtime tuning (especially scheduler/process stability) is ongoing

## Contribution / Working Notes

- This is an internal product repository, not a polished OSS package
- Before changing behavior, verify route/script/runbook coupling
- Treat monitor formatting/dictionaries/telegram templates as product-critical operational logic
- Prefer incremental, testable changes over broad refactors

For internal docs index, see [`docs/README.md`](docs/README.md).
