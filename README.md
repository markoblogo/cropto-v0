# Cropto

[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cropto is indexed trading and settlement infrastructure for agricultural commodities.

Cropto is the trade, document and settlement layer of the AMI ecosystem. It is designed for spot and options workflows on agricultural commodities and local commodity indices, using 1D3X/SPIKE benchmark data as reference infrastructure.

Cropto is not a generic crypto exchange. Blockchain is used as a trust and verification layer: document tokenization, contract-state records, settlement traceability and optional programmable clearing. The platform has implemented document-to-token workflows and tokenized settlement mechanics on Polygon testnet infrastructure.

1D3X Cortex is the active internal intelligence product around Index Platform,
MN7R and Cr0pto. Cropto currently contributes an approved source manifest for
the shared artifact pipeline and documents a future bounded consumer contract.
It is not yet a live Cortex runtime adapter and does not write Ecosystem
Evidence events. When revived, its assistant surfaces may use bounded evidence,
market/index context and governed tool proposals, but must never bypass trading,
settlement, token, wallet or clearing controls.

Standalone development is currently paused while the AMI ecosystem expands through MN7R, 1D3X and SPIKE. The codebase remains functional and can be revived for partner-backed indexed trading and settlement pilots.

## Links

- Live site: [https://cr0pto.com](https://cr0pto.com)
- Investor deck: [https://cr0pto.com/deck](https://cr0pto.com/deck)
- Repository status: [PRODUCT_STATUS.md](./PRODUCT_STATUS.md)
- Revival roadmap: [REVIVAL_ROADMAP.md](./REVIVAL_ROADMAP.md)
- AMI integration: [AMI_INTEGRATION.md](./AMI_INTEGRATION.md)
- 1D3X Cortex integration: [docs/1d3x-cortex-integration.md](./docs/1d3x-cortex-integration.md)
- Demo guide: [DEMO.md](./DEMO.md)

## What Cropto Is

Cropto is a functional prototype and architecture base for indexed commodity-market infrastructure.

It combines four layers:

1. **Indexed trading layer** - spot, forward and options-style workflows linked to local commodity indices.
2. **Document and contract verification layer** - document-bound records, contract metadata, ownership/state transitions and audit history.
3. **Settlement and accounting layer** - CROPT as an internal demo accounting/settlement unit, margin logic, P&L calculation, settlement records and reconciliation views.
4. **Optional blockchain trust layer** - ERC-20/ERC-721 testnet contracts, on-chain transaction tracking and tokenized document/option records where blockchain adds auditability.

## What Cropto Is Not

Cropto is not a generic crypto exchange, NFT marketplace or DeFi product.

Tokenization is used as a representation and trust mechanism. Document-bound tokenized records represent documents, contract states or settlement events; they are not designed as standalone speculative assets.

Cropto is also not currently operating as a live financial trading venue. The repository contains prototype, demo, staging and operational workflow modules that require partner, legal, regulatory and infrastructure decisions before any regulated production use.

## Implemented Prototypes and Modules

The repository supports the following claims:

- **Document-to-token / NFT-like document records**: `CroptOptionNFT` ERC-721 contract, option metadata generation, mint route and UI flow for document-bound option records.
- **Polygon testnet settlement experiments**: CROPT ERC-20 contract, on-chain mint/balance routes, transaction tracking and deployment notes for Polygon Amoy.
- **Tokenized asset settlement tests**: option exercise, settlement, margin call, force-settlement and on-chain transaction tables/routes.
- **Internal USD-linked settlement-unit concept**: CROPT is used in the prototype as a demo accounting, margin and settlement unit.
- **Spot/options/indexed trading architecture**: market index tables, spot positions, options, forward orders/contracts, forward settlements, spreads and index-based P&L logic.
- **Sea Brokerage Monitor**: BID/OFFER/TRADE workflows, matching views, market memory, broker attribution and operational tape/archive/analytics surfaces.
- **Operational integrations**: Telegram broker auth/relay/reporting paths, scheduled report jobs, Google Sheets dictionary/record sync scripts and ingestion tooling.

## How Cropto Fits Into AMI

Cropto is intended to sit inside a broader agro-commodity market infrastructure stack:

- **MN7R / Monitor** captures brokerage workflows, BID/OFFER/TRADE activity, contracts and market memory.
- **1D3X / SPIKE / UGA Index** provide local commodity and logistics benchmark indices.
- **1D3X Cortex** provides the evidence-backed context layer that can compare
  index, monitor and market signals before any LLM-assisted drafting. Cr0pto is
  a source-manifest producer and documented future consumer of the Index-hosted
  Cortex context-pack and Ecosystem Evidence read contracts. It does not yet
  have a live adapter or evidence writer. Cr0pto can export a local Cortex
  source manifest with
  `npm run cortex:source-manifest` so Index-hosted Cortex can inventory approved
  Cr0pto docs, public surfaces, code, runbooks and plans. Index can include the
  manifest in its local runtime artifact with `npm run cortex:artifact-build`.
- **Cropto** consumes these indices as reference infrastructure for indexed spot/options workflows, document verification and settlement logic.
- **Future regulated partners** may provide clearing, custody, payment rails and compliant risk instruments.

In this model, Cropto is the indexed trading and settlement layer. It does not replace physical trade execution; it creates a verifiable digital layer around indexed exposure, contract state and settlement traceability.

## Current Status

- **Paused standalone development**: Cropto is not the main active standalone product while AMI expands through MN7R, 1D3X and SPIKE.
- **Functional prototype**: the codebase builds and contains working application, API, database, on-chain, monitor and integration modules.
- **Partner-pilot ready with work**: a pilot would require scope selection, data-source integration, legal/regulatory review, partner rails and product hardening.
- **Architecture under review**: final ledger/clearing design remains chain-optional and should be selected by partner, jurisdiction and compliance needs.
- **Not currently live trading**: the public site and app should be treated as demo/prototype infrastructure, not a regulated venue.

See [PRODUCT_STATUS.md](./PRODUCT_STATUS.md) for a more detailed status map.

## Key Product Areas

- Main Cropto web app for market, portfolio, options, spot and forward workflows.
- Market dashboard and market-data ingestion layers.
- Sea Brokerage Monitor at `/spike-monitor`.
- Broker auth/session and Telegram relay flows for monitor operations.
- Operational/reporting modules: daily reports, export, analytics and Sheets sync.
- Partner/investor deck at `/deck`.

## Sea Brokerage Monitor

Sea Brokerage Monitor is the most operationally mature module in this repository.

### Purpose

- Fast broker workflow for creating and scanning BID/OFFER/TRADE ideas.
- Rolling matching visibility.
- Structured operational relay into Telegram channels.
- Market memory for later index, risk and settlement infrastructure.

### Current UX Shape

- Top global filter row: commodity, origin, basis, delivery place, business unit, currency, transport type, broker and search.
- Dual-pane `OFFERS` and `BIDS`.
- `MATCHES` and `TRADES` operational blocks.
- Secondary views: `Tape`, `Archive`, `Analytics`, with exports/reporting.

### Current Backend/Ops Shape

- API-backed persistence for monitor entries.
- Monitor-specific Telegram auth/session path.
- Telegram relay publisher and scheduled daily reports.
- Sheets sync scheduler for monitor data sync.
- Dictionary import tooling from Google Sheets.

## Repository Structure

```text
.
├── client/        # React frontend routes, shared UI and feature modules
├── server/        # Express API, monitor services, schedulers and ingestion jobs
├── shared/        # Shared schema/types between client and server
├── contracts/     # ERC-20 / ERC-721 prototype contracts
├── db/            # DB connection/helpers
├── migrations/    # SQL migration files
├── scripts/       # Operational scripts, imports, smoke tests and diagnostics
├── docs/          # Internal product/deploy/runbook documentation
├── public/        # Public static assets and public docs
├── tests/         # Test and verification assets
├── railway.json   # Railway deployment config
└── package.json
```

### Notable Paths

- `client/src/components/home/` - public homepage sections.
- `client/src/components/deck/` - partner/investor deck page.
- `client/src/features/sea-brokerage-monitor/` - Monitor UI and client-side services.
- `server/monitor/` and `server/services/seaBrokerage*.ts` - Monitor backend services.
- `server/onchainRoutes.ts`, `server/services/onchain.ts`, `contracts/` - on-chain prototype routes and contracts.
- `shared/schema.ts` - core database schema for indices, options, settlements, forwards and monitor entries.
- `scripts/sea_brokerage_*.ts` - monitor operations scripts.

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

### Integrations and Ops

- Polygon Amoy testnet routes/contracts for prototype token and document-record flows.
- Telegram bot integration for auth, relay and reporting paths.
- Supabase integration hooks.
- Google Sheets import/sync tooling.
- Railway deployment.
- Playwright smoke tooling.

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

### Required Minimum Env

- `DATABASE_URL`
- `SESSION_SECRET`
- `JWT_SECRET`
- `JOB_RUNNER_SECRET` in production, required for operational job endpoints such as margin checks, daily settlement and index ingestion triggers

For monitor auth/relay work, also configure:

- `TELEGRAM_BOT_TOKEN`
- `SEA_BROKERAGE_MONITOR_JWT_SECRET`
- `VITE_SEA_BROKERAGE_TELEGRAM_BOT_USERNAME`
- monitor relay/chat vars from `.env.example`

For on-chain prototype work, configure:

- `POLYGON_AMOY_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `CROPT_CONTRACT_ADDRESS`
- `CROPT_NFT_CONTRACT_ADDRESS`
- `ENABLE_MINT`

### DB and Run

```bash
npm run db:push
npm run dev
```

Run jobs/schedulers in parallel when needed:

```bash
npm run dev:jobs
```

### Build and Checks

```bash
npm run check
npm run i18n:check
npm run build
npm audit --omit=dev
```

Useful operational scripts:

```bash
npm run sea-brokerage:telegram:smoke
npm run sea-brokerage:dictionaries:import
npm run ops:terminal -- session status
npm run e2e:smoke
```

## Deployment / Hosting

- Primary deployment target: Railway (`railway.json`).
- Main docs:
  - [docs/deploy-runbook.md](docs/deploy-runbook.md)
  - [docs/sea-brokerage-monitor-railway-runbook.md](docs/sea-brokerage-monitor-railway-runbook.md)
  - [docs/sea-brokerage-telegram-partner-handoff.md](docs/sea-brokerage-telegram-partner-handoff.md)

## Current Limitations

- Product maturity is uneven across modules.
- Some legacy docs and locale files still use older NFT/crypto-first wording and should be aligned with the new positioning.
- Full local development requires a configured database and feature-specific env values.
- Telegram, Sheets and on-chain flows are feature-scoped integrations; configure only the modules being tested.
- Legal/regulatory architecture is intentionally not finalized in this repository.
- Dependency audit still has residual risk from major-version migrations or no-fix packages: `drizzle-orm`, `nodemailer`, Hardhat toolchain transitive dependencies and `xlsx`. Treat these as tracked follow-up migrations rather than silent production acceptance.

## Operational Hardening Baseline

- Public registration now grants only `USER`; elevated roles should be created through controlled operator flows.
- Self-service role updates cannot assign broker/admin roles.
- Operational job endpoints require `JOB_RUNNER_SECRET` in production.
- API, auth and upload endpoints have process-local rate limits.
- Uploaded feedback images are served with static-file hardening headers and dotfile denial.
- `GET /api/wallet/:userId` is restricted to the user themself or an admin/broker operator.

## Contribution / Working Notes

- This is an internal product repository, not a polished OSS package.
- Before changing behavior, verify route/script/runbook coupling.
- Treat monitor formatting, dictionaries and Telegram templates as product-critical operational logic.
- Keep public positioning aligned with AMI: indexed commodity workflows, document verification, settlement traceability and chain-optional infrastructure.
- Prefer incremental, testable changes over broad refactors.

For internal docs index, see [docs/README.md](docs/README.md).


## CortexABV Synthetic Test
This is a controlled public-safe marker for workflow verification only.
_No action/change intent beyond read-only-safe PR proposal surface test._
