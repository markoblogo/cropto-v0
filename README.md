# Cropto

[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cropto is an early-stage product for commodity trading, market monitoring, and brokerage workflows.

This repository contains the current Cropto MVP: the main web application, the supporting Node/Express backend, market-data ingestion paths, and the latest workflow modules such as Sea Brokerage Monitor.

The project is currently in active prototype / staging mode. Parts of the product are already interactive and partner-reviewable, while some integrations and operational flows are still being hardened.

## Why this repo matters

Cropto is not just a landing page or a deck repo. The codebase now reflects a working product direction built around:

- commodity market monitoring
- trading and risk workflow prototypes
- broker-oriented operational surfaces
- admin and partner operations
- ingestion, monitoring, and deployment infrastructure behind those surfaces

## Product Areas

The current repository includes these visible product areas:

- **Market monitoring surfaces**  
  Dashboard, market-data views, and monitor-style pages for commodity, logistics, weather, and related market signals.

- **Trading and risk workflow surfaces**  
  Spot, options, forward-market, wallet, portfolio, and related workflow pages across the main app.

- **Sea Brokerage Monitor**  
  A broker workspace at `/spike-monitor` built for fast bid/offer entry, compact market scanning, and live matching.

- **Admin and operational tools**  
  Feedback, reconciliation, audit, waitlist, partner, and contract-management routes.

- **Data and ingestion backend**  
  Background jobs, polling, normalization, monitoring services, and API routes that support the product surfaces.

## Current Highlights

- Market dashboard and monitoring routes backed by API queries and ingestion services
- Trading UI flows for spot, options, forward, portfolio, and wallet scenarios
- Monitor workspace direction with richer operational modules and data services
- Sea Brokerage Monitor workspace with:
  - dual-pane `OFFERS` / `BIDS` layout
  - modal `Create BID` / `Create OFFER` flows
  - compact tape-style row presentation
  - rolling `Best Current Matches`
  - detail sheet, filtering, exports, and secondary views
- Product-oriented route shells for demo/staging review
- Shared frontend/backend schema and deployable build pipeline

## Sea Brokerage Monitor

Sea Brokerage Monitor is one of the clearest active product modules in this repo.

### Purpose

It is designed as a compact broker workspace for practical market work:

- scan offers and bids quickly
- create structured entries fast
- surface likely matches without requiring heavy navigation

### Current UX shape

- compact top toolbar with global filters
- dual-pane `OFFERS` / `BIDS` workspace
- pane-level tools for broker/search filtering
- compact tape rows optimized for scanning speed
- rolling matching block visible in the main workspace
- detail sheet for the full structured record

### Current implementation status

- client-side/local-state driven
- seeded demo data for QA and partner walkthroughs
- no backend persistence for brokerage entries yet
- prepared for future integration with Telegram/session/relay flows, but not fully live end-to-end

## Repository Structure

High-level structure:

```text
.
├── client/          # React frontend (routes, shared UI, feature modules, i18n)
├── server/          # Express API, auth, ingestion jobs, monitor services
├── shared/          # Shared schema and types across client/server
├── db/              # Database helpers
├── migrations/      # SQL and schema migration assets
├── contracts/       # Contract-related sources/config already present in repo
├── scripts/         # Operational, ingestion, smoke, and utility scripts
├── docs/            # Internal product, deploy, testing, and ops docs
├── public/          # Static assets and public files
├── tests/           # Repository tests and checks
├── railway.json
└── package.json
```

Notable frontend areas:

- `client/src/pages` - route-level product surfaces
- `client/src/components` - shared UI and shared product blocks
- `client/src/components/monitor` - monitor-oriented UI modules
- `client/src/features/sea-brokerage-monitor` - self-contained brokerage workflow feature

Notable backend areas:

- `server/routes.ts` - main API surface
- `server/monitor/*` - monitor services, providers, persistence, and routes
- `server/jobs/*` and `server/jobsRunner.ts` - background jobs and polling
- `server/ingestion/*` - ingestion scheduling and normalization

## Tech Stack

### Frontend

- React 18 + TypeScript
- Vite
- Wouter
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS
- Radix UI / shadcn-style primitives
- Recharts
- i18next
- MapLibre GL

### Backend

- Node.js 22
- Express
- TypeScript
- Drizzle ORM
- PostgreSQL-compatible database
- Zod validation
- Passport/local auth pieces
- Supabase integration hooks
- Nodemailer / Resend support

### Tooling and deployment

- Railway deployment config
- esbuild server bundling in production build
- Playwright installed during postinstall for smoke/browser checks
- Hardhat / ethers already present for contract-related work

## Local Development

### Prerequisites

- Node.js `22.x`
- PostgreSQL-compatible database
- npm

### Install

```bash
npm install
cp .env.example .env
```

At minimum, local development needs working values for:

- `DATABASE_URL`
- `SESSION_SECRET`
- `JWT_SECRET`

### Database

```bash
npm run db:push
```

Alternative migration commands:

```bash
npm run db:migrate
npm run migrate
```

### Run the app

```bash
npm run dev
```

Run jobs/pollers separately when needed:

```bash
npm run dev:jobs
```

Typical local app URL:

- `http://127.0.0.1:5000`

### Build and checks

```bash
npm run build
npm run check
```

Useful additional scripts:

```bash
npm run e2e:smoke
npm run ingest:probe
npm run ingest:smoke
npm run ingest:backfill
npm run i18n:extract
npm run i18n:check
```

## Environment and Configuration

Relevant configuration is visible in `.env.example`.

Current categories include:

- **Core app**  
  `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`

- **Supabase**  
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

- **On-chain / contracts**  
  deployer keys, RPC URLs, and contract address settings

- **Market data ingestion**  
  polling toggles, provider settings, and scheduler flags

- **Telegram / scraping / relay-adjacent flows**  
  bot tokens, scraper toggles, and related job/runtime flags

Not every variable is required for every route. Some are only needed for specific integrations or jobs.

## Deployment

The repo contains a concrete Railway-oriented deploy path.

- `railway.json` defines the deployment shape
- `docs/deploy-runbook.md` documents the current operational flow
- staging/demo verification target is [cropto.abvx.xyz](https://cropto.abvx.xyz)

Important current nuance:

- `main` is the current repository mainline
- staging/deploy branch assumptions may still reference `release/demo` until infra is intentionally simplified

Useful production commands:

```bash
npm run build
npm start
npm run start:jobs
```

## Current Limitations

Useful realities before building on top of this repo:

- product maturity is uneven across modules
- some UX flows are polished but still prototype-grade under the hood
- some features still rely on mock/demo or local-state behavior
- Sea Brokerage Monitor entries are not yet persisted through a full backend workflow
- some Telegram/session/relay paths are prepared rather than fully productionized
- deployment and operational assumptions are still somewhat project-specific

## Contribution / Working Notes

This repo behaves more like an internal product codebase than a polished open-source package.

Practical guidance:

- validate against real routes, scripts, and config before broad refactors
- be careful with top-level content and historical artifacts; some are active, some are transitional
- treat product claims conservatively when editing docs or shipping partner-facing copy
- prefer keeping main operational paths understandable over adding parallel experimental layers

Additional internal docs are indexed in [docs/README.md](docs/README.md).


<!-- CortexABV synthetic test marker: public-safe README update for proposal-only verification. -->
CortexABV synthetic test marker for workflow verification.
