
````
# Cropto v0

Prototype (demo / non-production) platform for commodity-linked instruments:
index pricing (USD/t), spot/forward-style flows, options marketplace, and risk controls.

**Important:** This repository is for demonstration and testing only.
It is not a licensed trading venue, broker, or financial advisor.

## Live Demo
- https://cropto.abvx.xyz

## Tech Stack
- Client: React + TypeScript (Vite)
- Server: Express + TypeScript
- DB: Postgres (Neon supported) + Drizzle ORM
- Charts/UI: Recharts, Radix UI, Tailwind

## Repository Structure
- `client/` — frontend UI
- `server/` — API, services, jobs/ingestion (if enabled)
- `shared/` — shared schema/types

## Getting Started (Local)

### 1) Requirements
- Node.js 20+
- Postgres database (local or Neon)
- npm

### 2) Install
```bash
npm install
````

### **3) Configure environment**

  

Create .env from .env.example:

```
cp .env.example .env
```

At minimum you’ll need:

- DATABASE_URL=... (Postgres connection string)
    
- session/auth related secrets (see .env.example)
    

  

### **4) Push DB schema (Drizzle)**

```
npm run db:push
```

### **5) Run dev server**

```
npm run dev
```

Open the app in the browser (see console output).

  

## **Build & Production**

```
npm run build
npm run start
```

## **Typecheck**

```
npm run check
```

## **Data Sources & Freshness (Index Prices)**

  

Cropto index prices are normalized to **USD per ton (USD/t)**.

  

UI surfaces data freshness using:

- **As of** (market date)
    
- **Fetched** (fetch timestamp)
    
- **Status** (Fresh / Stale / Failed)
    
- **Source** (primary/fallback)
    

  

See: docs/data-sources.md (primary + fallback sources per country/commodity).

  

## **Demo Disclaimer**

  

Cropto is provided “as is” solely for demonstration and testing purposes.

No warranties are given. Use at your own risk.

  

## **License**

  

All rights reserved. See LICENSE.

````
---

## `.env.example` (минимальный каркас)

```env
# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB

# App
NODE_ENV=development
APP_BASE_URL=http://localhost:3000

# Sessions/Auth (examples)
SESSION_SECRET=change-me

# Feature flags (examples)
ENABLE_INGESTION=true
ENABLE_MINT=false
````
