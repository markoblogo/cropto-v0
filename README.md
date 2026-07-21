# Cropto
# Cropto


[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


Cropto is an early-stage product for commodity trading, market monitoring, and brokerage workflows.
Cropto is an early-stage product for commodity trading, market monitoring, and brokerage workflows.


This repository contains the current Cropto MVP: the main web application, the supporting Node/Express backend, market-data ingestion paths, and the latest workflow modules such as Sea Brokerage Monitor.
This repository contains the current Cropto MVP: the main web application, the supporting Node/Express backend, market-data ingestion paths, and the latest workflow modules such as Sea Brokerage Monitor.


The project is currently in active prototype / staging mode. Parts of the product are already interactive and partner-reviewable, while some integrations and operational flows are still being hardened.
The project is currently in active prototype / staging mode. Parts of the product are already interactive and partner-reviewable, while some integrations and operational flows are still being hardened.


## Why this repo matters
## Why this repo matters


Cropto is not just a landing page or a deck repo. The codebase now reflects a working product direction built around:
Cropto is not just a landing page or a deck repo. The codebase now reflects a working product direction built around:


- commodity market monitoring
- commodity market monitoring
- trading and risk workflow prototypes
- trading and risk workflow prototypes
- broker-oriented operational surfaces
- broker-oriented operational surfaces
- admin and partner operations
- admin and partner operations
- ingestion, monitoring, and deployment infrastructure behind those surfaces
- ingestion, monitoring, and deployment infrastructure behind those surfaces


## Product Areas
## Product Areas


The current repository includes these visible product areas:
The current repository includes these visible product areas:


- **Market monitoring surfaces**  
- **Market monitoring surfaces**  
  Dashboard, market-data views, and monitor-style pages for commodity, logistics, weather, and related market signals.
  Dashboard, market-data views, and monitor-style pages for commodity, logistics, weather, and related market signals.


- **Trading and risk workflow surfaces**  
- **Trading and risk workflow surfaces**  
  Spot, options, forward-market, wallet, portfolio, and related workflow pages across the main app.
  Spot, options, forward-market, wallet, portfolio, and related workflow pages across the main app.


- **Sea Brokerage Monitor**  
- **Sea Brokerage Monitor**  
  A broker workspace at `/spike-monitor` built for fast bid/offer entry, compact market scanning, and live matching.
  A broker workspace at `/spike-monitor` built for fast bid/offer entry, compact market scanning, and live matching.


- **Admin and operational tools**  
- **Admin and operational tools**  
  Feedback, reconciliation, audit, waitlist, partner, and contract-management routes.
  Feedback, reconciliation, audit, waitlist, partner, and contract-management routes.


- **Data and ingestion backend**  
- **Data and ingestion backend**  
  Background jobs, polling, normalization, monitoring services, and API routes that support the product surfaces.
  Background jobs, polling, normalization, monitoring services, and API routes that support the product surfaces.


## Current Highlights
## Current Highlights
- The project now expands indexed spot market exposure across Ukraine, Argentina, and Brazil.


- Market dashboard and monitoring routes backed by API queries and ingestion services
- Market dashboard and monitoring routes backed by API queries and ingestion services
- Trading UI flows for spot, options, forward, portfolio, and wallet scenarios
- Trading UI flows for spot, options, forward, portfolio, and wallet scenarios
- Monitor workspace direction with richer operational modules and data services
- Monitor workspace direction with richer operational modules and data services
- Sea Brokerage Monitor workspace with:
- Sea Brokerage Monitor workspace with:
  - dual-pane `OFFERS` / `BIDS` layout
  - dual-pane `OFFERS` / `BIDS` layout
  - modal `Create BID` / `Create OFFER` flows
  - modal `Create BID` / `Create OFFER` flows
  - compact tape-style row presentation
  - compact tape-style row presentation
  - rolling `Best Current Matches`
  - rolling `Best Current Matches`
  - detail sheet, filtering, exports, and secondary views
  - detail sheet, filtering, exports, and secondary views
- Product-oriented route shells for demo/staging review
- Product-oriented route shells for demo/staging review
- Shared frontend/backend schema and deployable build pipeline
- Shared frontend/backend schema and deployable build pipeline


## Sea Brokerage Monitor
## Sea Brokerage Monitor


Sea Brokerage Monitor is one of the clearest active product modules in this repo.
Sea Brokerage Monitor is one of the clearest active product modules in this repo.


### Purpose
### Purpose


It is designed as a compact broker workspace for practical market work:
It is designed as a compact broker workspace for practical market work:


- scan offers and bids quickly
- scan offers and bids quickly
- create structured entries fast
- create structured entries fast
- surface likely matches without requiring heavy navigation
- surface likely matches without requiring heavy navigation


### Current UX shape
### Current UX shape


- compact top toolbar with global filters
- compact top toolbar with global filters
- dual-pane `OFFERS` / `BIDS` workspace
- dual-pane `OFFERS` / `BIDS` workspace
- pane-level tools for broker/search filtering
- pane-level tools for broker/search filtering
- compact tape rows optimized for scanning speed
- compact tape rows optimized for scanning speed
- rolling matching block visible in the main workspace
- rolling matching block visible in the main workspace
- detail sheet for the full structured record
- detail sheet for the full structured record


### Current implementation status
### Current implementation status


- client-side/local-state driven
- client-side/local-state driven
- seeded demo data for QA and partner walkthroughs
- seeded demo data for QA and partner walkthroughs
- no backend persistence for brokerage entries yet
- no backend persistence for brokerage entries yet
- prepared for future integration with Telegram/session/relay flows, but not fully live end-to-end
- prepared for future integration with Telegram/session/relay flows, but not fully live end-to-end


## Repository Structure
## Repository Structure


High-level structure:
High-level structure:


```text
```text
.
.
├── client/          # React frontend (routes, shared UI, feature modules, i18n)
├── client/          # React frontend (routes, shared UI, feature modules, i18n)
├── server/          # Express API, auth, ingestion jobs, monitor services
├── server/          # Express API, auth, ingestion jobs, monitor services
├── shared/          # Shared schema and types across client/server
├── shared/          # Shared schema and types across client/server
├── db/              # Database helpers
├── db/              # Database helpers
├── migrations/      # SQL and schema migration assets
├── migrations/      # SQL and schema migration assets
├── contracts/       # Contract-related sources/config already present in repo
├── contracts/       # Contract-related sources/config already present in repo
├── scripts/         # Operational, ingestion, smoke, and utility scripts
├── scripts/         # Operational, ingestion, smoke, and utility scripts
├── docs/            # Internal product, deploy, testing, and ops docs
├── docs/            # Internal product, deploy, testing, and ops docs
├── public/          # Static assets and public files
├── public/          # Static assets and public files
├── tests/           # Repository tests and checks
├── tests/           # Repository tests and checks
├── railway.json
├── railway.json
└── package.json
└── package.json
```
```


Notable frontend areas:
Notable frontend areas:


- `client/src/pages` - route-level product surfaces
- `client/src/pages` - route-level product surfaces
- `client/src/components` - shared UI and shared product blocks
- `client/src/components` - shared UI and shared product blocks
- `client/src/components/monitor` - monitor-oriented UI modules
- `client/src/components/monitor` - monitor-oriented UI modules
- `client/src/features/sea-brokerage-monitor` - self-contained brokerage workflow feature
- `client/src/features/sea-brokerage-monitor` - self-contained brokerage workflow feature


Notable backend areas:
Notable backend areas:


- `server/routes.ts` - main API surface
- `server/routes.ts` - main API surface
- `server/monitor/*` - monitor services, providers, persistence, and routes
- `server/monitor/*` - monitor services, providers, persistence, and routes
- `server/jobs/*` and `server/jobsRunner.ts` - background jobs and polling
- `server/jobs/*` and `server/jobsRunner.ts` - background jobs and polling
- `server/ingestion/*` - ingestion scheduling and normalization
- `server/ingestion/*` - ingestion scheduling and normalization


## Tech Stack
## Tech Stack


### Frontend
### Frontend


- React 18 + TypeScript
- React 18 + TypeScript
- Vite
- Vite
- Wouter
- Wouter
- TanStack Query
- TanStack Query
- React Hook Form + Zod
- React Hook Form + Zod
- Tailwind CSS
- Tailwind CSS
- Radix UI / shadcn-style primitives
- Radix UI / shadcn-style primitives
- Recharts
- Recharts
- i18next
- i18next
- MapLibre GL
- MapLibre GL


### Backend
### Backend


- Node.js 22
- Node.js 22
- Express
- Express
- TypeScript
- TypeScript
- Drizzle ORM
- Drizzle ORM
- PostgreSQL-compatible database
- PostgreSQL-compatible database
- Zod validation
- Zod validation
- Passport/local auth pieces
- Passport/local auth pieces
- Supabase integration hooks
- Supabase integration hooks
- Nodemailer / Resend support
- Nodemailer / Resend support


### Tooling and deployment
### Tooling and deployment


- Railway deployment config
- Railway deployment config
- esbuild server bundling in production build
- esbuild server bundling in production build
- Playwright installed during postinstall for smoke/browser checks
- Playwright installed during postinstall for smoke/browser checks
- Hardhat / ethers already present for contract-related work
- Hardhat / ethers already present for contract-related work


## Local Development
## Local Development


### Prerequisites
### Prerequisites


- Node.js `22.x`
- Node.js `22.x`
- PostgreSQL-compatible database
- PostgreSQL-compatible database
- npm
- npm


### Install
### Install


```bash
```bash
npm install
npm install
cp .env.example .env
cp .env.example .env
```
```


At minimum, local development needs working values for:
At minimum, local development needs working values for:


- `DATABASE_URL`
- `DATABASE_URL`
- `SESSION_SECRET`
- `SESSION_SECRET`
- `JWT_SECRET`
- `JWT_SECRET`


### Database
### Database


```bash
```bash
npm run db:push
npm run db:push
```
```


Alternative migration commands:
Alternative migration commands:


```bash
```bash
npm run db:migrate
npm run db:migrate
npm run migrate
npm run migrate
```
```


### Run the app
### Run the app


```bash
```bash
npm run dev
npm run dev
```
```


Run jobs/pollers separately when needed:
Run jobs/pollers separately when needed:


```bash
```bash
npm run dev:jobs
npm run dev:jobs
```
```


Typical local app URL:
Typical local app URL:


- `http://127.0.0.1:5000`
- `http://127.0.0.1:5000`


### Build and checks
### Build and checks


```bash
```bash
npm run build
npm run build
npm run check
npm run check
```
```


Useful additional scripts:
Useful additional scripts:


```bash
```bash
npm run e2e:smoke
npm run e2e:smoke
npm run ingest:probe
npm run ingest:probe
npm run ingest:smoke
npm run ingest:smoke
npm run ingest:backfill
npm run ingest:backfill
npm run i18n:extract
npm run i18n:extract
npm run i18n:check
npm run i18n:check
```
```


## Environment and Configuration
## Environment and Configuration


Relevant configuration is visible in `.env.example`.
Relevant configuration is visible in `.env.example`.


Current categories include:
Current categories include:


- **Core app**  
- **Core app**  
  `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`
  `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`


- **Supabase**  
- **Supabase**  
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`


- **On-chain / contracts**  
- **On-chain / contracts**  
  deployer keys, RPC URLs, and contract address settings
  deployer keys, RPC URLs, and contract address settings


- **Market data ingestion**  
- **Market data ingestion**  
  polling toggles, provider settings, and scheduler flags
  polling toggles, provider settings, and scheduler flags


- **Telegram / scraping / relay-adjacent flows**  
- **Telegram / scraping / relay-adjacent flows**  
  bot tokens, scraper toggles, and related job/runtime flags
  bot tokens, scraper toggles, and related job/runtime flags


Not every variable is required for every route. Some are only needed for specific integrations or jobs.
Not every variable is required for every route. Some are only needed for specific integrations or jobs.


## Deployment
## Deployment


The repo contains a concrete Railway-oriented deploy path.
The repo contains a concrete Railway-oriented deploy path.


- `railway.json` defines the deployment shape
- `railway.json` defines the deployment shape
- `docs/deploy-runbook.md` documents the current operational flow
- `docs/deploy-runbook.md` documents the current operational flow
- staging/demo verification target is [cropto.abvx.xyz](https://cropto.abvx.xyz)
- staging/demo verification target is [cropto.abvx.xyz](https://cropto.abvx.xyz)


Important current nuance:
Important current nuance:


- `main` is the current repository mainline
- `main` is the current repository mainline
- staging/deploy branch assumptions may still reference `release/demo` until infra is intentionally simplified
- staging/deploy branch assumptions may still reference `release/demo` until infra is intentionally simplified


Useful production commands:
Useful production commands:


```bash
```bash
npm run build
npm run build
npm start
npm start
npm run start:jobs
npm run start:jobs
```
```


## Current Limitations
## Current Limitations


Useful realities before building on top of this repo:
Useful realities before building on top of this repo:


- product maturity is uneven across modules
- product maturity is uneven across modules
- some UX flows are polished but still prototype-grade under the hood
- some UX flows are polished but still prototype-grade under the hood
- some features still rely on mock/demo or local-state behavior
- some features still rely on mock/demo or local-state behavior
- Sea Brokerage Monitor entries are not yet persisted through a full backend workflow
- Sea Brokerage Monitor entries are not yet persisted through a full backend workflow
- some Telegram/session/relay paths are prepared rather than fully productionized
- some Telegram/session/relay paths are prepared rather than fully productionized
- deployment and operational assumptions are still somewhat project-specific
- deployment and operational assumptions are still somewhat project-specific


## Contribution / Working Notes
## Contribution / Working Notes


This repo behaves more like an internal product codebase than a polished open-source package.
This repo behaves more like an internal product codebase than a polished open-source package.


Practical guidance:
Practical guidance:


- validate against real routes, scripts, and config before broad refactors
- validate against real routes, scripts, and config before broad refactors
- be careful with top-level content and historical artifacts; some are active, some are transitional
- be careful with top-level content and historical artifacts; some are active, some are transitional
- treat product claims conservatively when editing docs or shipping partner-facing copy
- treat product claims conservatively when editing docs or shipping partner-facing copy
- prefer keeping main operational paths understandable over adding parallel experimental layers
- prefer keeping main operational paths understandable over adding parallel experimental layers


Additional internal docs are indexed in [docs/README.md](docs/README.md).
Additional internal docs are indexed in [docs/README.md](docs/README.md).




<!-- CortexABV synthetic test marker: public-safe README update for proposal-only verification. -->
<!-- CortexABV synthetic test marker: public-safe README update for proposal-only verification. -->
CortexABV synthetic test marker for workflow verification.
CortexABV synthetic test marker for workflow verification.
