# Cropto

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org/)

> Cropto is a commodity market infrastructure prototype focused on tokenized local grain indices, options-style risk instruments, and market data workflows.

![Cropto Platform](<attached_assets/cropto cover2_1762265015324.png>)

## Status

Cropto is in active development.

This repository contains the current prototype/demo environment and may change quickly between releases.

## Current positioning / What Cropto is

Cropto is being developed as a digital infrastructure layer for commodity markets, with emphasis on:

- tokenized local spot-index logic (regional market orientation),
- options-style and futures-style risk workflows (prototype scope),
- market dashboard and trading UI flows,
- partner/investor narrative layer via `/deck`.

This repo should be treated as an evolving product prototype, not a finalized production exchange.

## Key repository highlights

- Main product/demo UI (dashboard + trading screens)
- Market data ingestion and policy logic
- Shared schema/types across client and server
- Light/dark theme support
- Partner/Investor deck route: `/deck`
- Contact/feedback submission flow with email notifications

### `/deck` page

`/deck` is a dedicated partner/investor page in Cropto-native style. It includes:

- standalone header/footer,
- market thesis and product narrative,
- embedded teaser video section,
- Google Slides deck embed + PDF link,
- FAQ and contact section.

## Tech stack

### Frontend
- React 18 + TypeScript
- Vite
- Wouter
- TanStack Query
- Tailwind CSS
- shadcn/ui + Radix UI

### Backend
- Node.js + Express (TypeScript)
- Drizzle ORM
- PostgreSQL
- Zod validation
- Nodemailer + Resend integration for email delivery

## Quick start

### Prerequisites
- Node.js 22.x
- PostgreSQL database
- npm

### Setup

```bash
git clone <your-repo-url>
cd cropto-v0
npm install
cp .env.example .env
# edit .env
npm run db:push
npm run dev
```

By default, the development server runs on port `5000`.

## Environment variables

Use `.env.example` as baseline. Commonly required variables:

```env
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
NODE_ENV=development
APP_BASE_URL=http://localhost:5173
```

Email/feedback related (optional but recommended):

```env
# Preferred
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM="Cropto Deck <onboarding@resend.dev>"

# Recipients
FEEDBACK_ALERT_EMAILS=a.biletskiy@gmail.com

# SMTP fallback (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## Project structure (high level)

```text
cropto-v0/
├── client/                 # Frontend (Vite + React)
│   ├── public/             # Static assets (including /deck assets)
│   └── src/
│       ├── components/
│       ├── pages/
│       └── App.tsx
├── server/                 # Backend API/server
├── shared/                 # Shared schema/types
├── docs/                   # Project documentation
├── public/                 # Additional static docs/assets
└── package.json
```

## Available scripts

Scripts are listed from current `package.json`:

```bash
npm run dev
npm run dev:jobs
npm run build
npm run start
npm run start:jobs
npm run check
npm run db:push
npm run db:migrate
npm run migrate
npm run debug:igc
npm run ingest:probe
npm run ingest:smoke
npm run ingest:backfill
npm run e2e:smoke
npm run i18n:extract
npm run i18n:check
npm run data:backfill:usda
npm run data:audit:index-contract
npm run auth:sync-legacy-users
```

## Documentation links

Documentation index:

- [Docs index](docs/README.md)

Core EN/UK docs:

- [About (EN)](docs/about.en.md)
- [About (UK)](docs/about.uk.md)
- [FAQ (EN)](docs/faq.en.md)
- [FAQ (UK)](docs/faq.uk.md)
- [Testing (EN)](docs/testing.en.md)
- [Testing (UK)](docs/testing.uk.md)

Operational and technical docs:

- [API examples](docs/api-examples.md)
- [Data sources](docs/data-sources.md)
- [Monitoring](docs/monitoring.md)
- [Deploy runbook](docs/deploy-runbook.md)

## License

MIT (see `package.json` license field).
