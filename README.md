# Cropto

[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cropto is an early-stage platform for commodity trading, market monitoring, and brokerage workflows.

This repository contains the current MVP codebase, including the main Cropto web app, supporting backend services, and emerging workflow surfaces such as Sea Brokerage Monitor.

The project is currently in active prototype / staging mode: some modules are already interactive and reviewable, while other integrations and operational flows are still being refined.

## Project Overview

Cropto is currently oriented around practical market workflows:

- commodity and regional market monitoring
- trading and portfolio-facing UI experiments
- options/forward/spot workflow prototypes
- broker-oriented structured entry and matching tooling
- supporting admin, feedback, and partner/demo surfaces

The repo includes both the React client and the Node/Express backend, along with database schema/migrations, ingestion jobs, and deployment configuration.

### Current development status

- Active prototype/staging application
- Product areas are at mixed maturity levels
- Some flows are fully interactive in the client but still rely on mock/demo or non-persistent behavior
- Railway deployment is documented and currently tied to the `release/demo` branch

## Key Product Areas

The following product areas are visibly implemented in the codebase today:

- **Market dashboard and monitoring surfaces**  
  Main dashboard, market-data views, and monitor workspaces for market signals, logistics, weather, and related indicators.

- **Spot / options / forward trading flows**  
  UI flows for options, forward-market and spot-trading scenarios, plus portfolio and wallet-related surfaces.

- **Sea Brokerage Monitor**  
  A dedicated broker workspace at `/spike-monitor` for structured bid/offer capture, compact offer/bid panes, and match discovery.

- **Market data ingestion and operational services**  
  Backend ingestion, scheduling, and monitor services covering market dashboards, external data sources, Telegram scraping, and related runtime checks.

- **Auth/session and admin operations**  
  Login/register, session-aware UI, admin pages, reconciliation, audit, waitlist, feedback, and partner/contract management surfaces.

- **Partner/demo surfaces**  
  `/deck` and related marketing/partner-facing presentation routes remain present in the repo, but they are no longer the only prominent product narrative.

## Current Feature Highlights

- Region-aware market dashboard and market-data pages backed by API queries
- Spot trading and options-style UI flows with portfolio and wallet summary surfaces
- Monitor V3 workspace for market/logistics/news-style operational monitoring
- Sea Brokerage Monitor dual-pane broker workspace:
  - `OFFERS` and `BIDS` panes with internal scroll
  - modal `Create BID` / `Create OFFER` flows
  - structured entry validation
  - seeded demo market entries for local/manual QA
  - rolling best-current-match stream
  - detail sheet, search/filtering, exports, and secondary archive/analytics views
- Feature-local Telegram-oriented session placeholder for Sea Brokerage Monitor
- Market/admin operational endpoints and deployment verification paths

## Repository Structure

High-level structure:

```text
.
├── client/          # React frontend (pages, components, feature modules, i18n)
├── server/          # Express API, auth, ingestion jobs, monitor services, admin routes
├── shared/          # Shared schema/types used across client and server
├── db/              # Database scripts/helpers
├── migrations/      # SQL and migration assets
├── contracts/       # On-chain contract sources and related config
├── scripts/         # Operational, ingestion, migration, and smoke scripts
├── docs/            # Internal product, testing, deployment, and ops documentation
├── public/          # Static assets and public files
├── tests/           # Test helpers / smoke-related assets
├── drizzle.config.ts
├── railway.json
└── package.json
```

Notable frontend areas:

- `client/src/pages` — route-level product surfaces
- `client/src/components` — shared UI and page components
- `client/src/features/sea-brokerage-monitor` — self-contained broker workspace feature module
- `client/src/components/monitor` — monitor workspace components

Notable backend areas:

- `server/routes.ts` and related route files — API surface
- `server/monitor/*` — monitor data/services
- `server/jobs/*` and `server/jobsRunner.ts` — background polling/scheduling jobs
- `server/auth.ts`, `server/authRoutes.ts` — auth/session APIs

## Tech Stack

### Frontend

- React 18 + TypeScript
- Vite
- Wouter
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS
- Radix UI / shadcn-style component primitives
- Recharts
- i18next
- MapLibre GL

### Backend

- Node.js 22
- Express
- TypeScript
- Drizzle ORM
- PostgreSQL / Neon-style connection support
- Zod validation
- Passport/local auth pieces
- Supabase integration hooks
- Nodemailer / Resend support

### Other platform/tooling

- Railway deployment config (`railway.json`)
- esbuild for server bundling in production build
- Playwright installed during postinstall for smoke/browser workflows
- Hardhat / ethers for on-chain-related development already present in the repo

## Local Development

### Prerequisites

- Node.js `22.x`
- PostgreSQL-compatible database
- npm

### Install

```bash
npm install
```

### Environment setup

Use `.env.example` as the starting point:

```bash
cp .env.example .env
```

At minimum, local development needs a working `DATABASE_URL`, `SESSION_SECRET`, and `JWT_SECRET`.

### Database

Push the current Drizzle schema to your database:

```bash
npm run db:push
```

Alternative migration-related commands also exist:

```bash
npm run db:migrate
npm run migrate
```

### Run the app

Start the web app:

```bash
npm run dev
```

Start jobs/pollers separately when needed:

```bash
npm run dev:jobs
```

Default local app URL is typically:

- `http://127.0.0.1:5000`

### Build and checks

```bash
npm run build
npm run check
```

Other useful repo scripts:

```bash
npm run e2e:smoke
npm run ingest:probe
npm run ingest:smoke
npm run ingest:backfill
npm run i18n:extract
npm run i18n:check
```

There is currently no single canonical lint script in `package.json`; `npm run check` is the primary repository-wide static type check.

## Environment and Configuration

Relevant configuration is visible in `.env.example`. Current categories include:

- **Core app**
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `JWT_SECRET`

- **Supabase**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

- **On-chain / contracts**
  - `DEPLOYER_PRIVATE_KEY`
  - `POLYGON_AMOY_RPC_URL`
  - contract addresses and chain settings

- **Market data ingestion**
  - polling toggles and source URLs

- **Telegram ingestion**
  - scraper/bot-related environment values

Some environment values are optional depending on which product areas or background jobs you are exercising locally.

## Deployment / Preview / Hosting

Deployment is not fully generic; the repo currently contains a concrete Railway-oriented path:

- `railway.json` defines Railway build/deploy configuration
- `docs/deploy-runbook.md` documents the deploy flow
- the runbook currently assumes the web service deploys from the `release/demo` branch
- the documented live/staging verification target is `https://cropto.abvx.xyz`

Useful deployment notes:

- `npm run build` builds both the client bundle and bundled server entrypoints in `dist/`
- `npm start` runs the built web service
- `npm run start:jobs` runs the built jobs service

If your environment differs from the documented Railway setup, treat the runbook as project-specific guidance rather than a universal deployment recipe.

## Sea Brokerage Monitor

Sea Brokerage Monitor is a dedicated broker workspace mounted at `/spike-monitor`.

### Purpose

It is designed as a compact operational tool for brokerage-style market work: capturing structured bids/offers, scanning current offers and bids separately, and surfacing likely matches quickly.

### Current UX shape

- compact top action/filter bar
- modal `Create BID` / `Create OFFER` entry flow
- dual-pane workspace:
  - `OFFERS`
  - `BIDS`
- compact chronological rows with internal scroll in each pane
- rolling `Best Current Matches` section visible in the main workspace
- detail sheet for structured entry inspection
- secondary views for feed/archive/analytics/export

### Major implemented capabilities

- strongly typed entry model
- seeded demo dataset for manual QA
- client-side filters and search
- local in-memory store for entries and matching state
- deterministic rule-based matching
- CSV/XLSX export from filtered data
- Telegram-oriented feature-local session placeholder
- relay formatting stub prepared for later Telegram publishing

### Current limitations

- no backend persistence yet
- no real Telegram auth backend yet
- no real outbound Telegram relay transport yet
- some flows remain prototype/demo-oriented even though the UI is polished

## Current Limitations / Work in Progress

Useful realities to know before building on top of this repo:

- Product maturity is uneven across modules; some areas are closer to demo-grade than production-grade
- Several workflows still rely on mock/demo data or local in-memory state
- Sea Brokerage Monitor currently stores entries client-side only
- Telegram session/relay behavior in Sea Brokerage Monitor is prepared but intentionally stubbed
- Deployment and operational assumptions are still fairly project-specific
- There is a mix of current surfaces and legacy/prototype surfaces in the same application

## Contribution / Working Notes

This repository reads like an internal product codebase rather than a polished open-source package. Practical contributor guidance:

- Treat the repo as a fast-moving staging/prototype environment
- Prefer validating against real routes, scripts, and config before documenting or refactoring
- Be careful with broad commits: the worktree may contain unrelated prototype or content changes
- `release/demo` is the branch referenced by the current deploy runbook
- When adding user-facing features, keep product claims honest: several integrations are intentionally prepared/stubbed rather than fully live

Additional project docs are indexed in [docs/README.md](./docs/README.md).
