# Cropto Demo Guide

This guide explains how to inspect Cropto as a prototype. It does not describe a live production trading venue.

## Local Setup

```bash
npm install
cp .env.example .env
```

Configure at minimum:

```text
DATABASE_URL=postgresql://...
SESSION_SECRET=...
JWT_SECRET=...
```

Initialize/update the database:

```bash
npm run db:push
```

Run the app:

```bash
npm run dev
```

Optional jobs/schedulers:

```bash
npm run dev:jobs
```

## Feature-Specific Env

Telegram/Monitor flows require the Telegram and Sea Brokerage env values documented in `.env.example`.

On-chain prototype flows require:

```text
POLYGON_AMOY_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
CROPT_CONTRACT_ADDRESS=...
CROPT_NFT_CONTRACT_ADDRESS=...
ENABLE_MINT=true
```

Keep `ENABLE_MINT=false` unless intentionally testing on-chain minting in a controlled testnet environment.

## Routes to Inspect

- `/` - public homepage, market dashboard and prototype entry points.
- `/deck` - partner/investor deck.
- `/market-data` - market/index data surfaces.
- `/options` - options workflow surface.
- `/spot-trading` - spot workflow surface.
- `/forward-market` - indexed forward workflow surface.
- `/portfolio` - portfolio and risk views.
- `/onchain-tx` - on-chain transaction history surface.
- `/spike-monitor` - Sea Brokerage Monitor.
- `/last30days` - last-30-days market/data surface.
- `/education` - education and FAQ content.

## What the Demo Proves

- Cropto can model indexed commodity-market workflows.
- Contract and option states can be recorded in structured database tables.
- Settlement and margin events can be represented and inspected.
- Document-bound option records can be represented through ERC-721 testnet contracts.
- CROPT can act as a demo accounting/settlement unit in prototype flows.
- Sea Brokerage Monitor can capture BID/OFFER/TRADE market memory and relay operational updates.
- Telegram, scheduled reporting and Sheets import paths exist for operational workflows.

## Demo and Seed Data

The app may contain demo, staging or imported market data depending on environment configuration. Treat displayed data as non-production unless a deployment owner confirms the source and status.

## What Is Not Live Production

The demo does not prove:

- regulated exchange operation;
- production clearing or custody;
- legally binding public trading;
- production-grade index governance;
- production payment/FX settlement;
- final chain architecture.

Any partner pilot should define market scope, participant rules, index source, legal perimeter, settlement architecture and operating procedures before use with real obligations.
