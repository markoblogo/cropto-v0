# Cropto - Crypto Options Trading Platform

## Overview

Cropto is a professional cryptocurrency options trading platform for creating and managing crypto options (calls and puts). It uses an off-chain order book and matching engine to facilitate trading. The platform offers a financial-focused interface for listing options, creating contracts, matching buyers and sellers, and tracking activity. The business vision is to provide a robust and intuitive platform for crypto derivatives, offering advanced trading capabilities and contributing to the adoption of regulated and efficient crypto options markets.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React and TypeScript, using Vite, `shadcn/ui` (Radix UI), and Tailwind CSS for a customizable financial-themed interface. State management uses TanStack Query and React Hook Form with Zod. Wouter handles client-side routing. Internationalization (i18n) is implemented using `react-i18next` with support for English and Ukrainian languages.

### Backend
The backend is an Express.js application in TypeScript, providing a RESTful JSON API. It features a flexible authentication system with Supabase (production) or file-based (`db.json`) for development, using bcrypt and JWT for security, supporting 'farmer', 'trader', and 'broker' roles. A database abstraction layer ensures transaction safety. Shared Zod schemas are used for data validation. A margin check job system calculates intrinsic value, P&L, triggers margin calls, and generates notifications. Security middleware blocks unauthorized Supabase service role key usage.

### Data Storage
The project uses PostgreSQL via Neon serverless driver with Drizzle ORM for schema management. Tables include `options`, `trades`, `settlements`, `margin_calls`, `notifications`, `indexes`, `commodity_index_prices`, and `spot_positions`, designed with high-precision decimals and UUID primary keys.

**Commodity Index System**: Two-table architecture for tracking commodity prices:
- `indexes`: Master table with 7 commodity definitions (Corn, Wheat 11.5%, Feed Wheat, GMO Soybeans, GMO Soybeans (processing), Rapeseed, Sunflower Seed) organized by categories (CPT ODESA, CPT PARITET ODESA). **Auto-seeded on server startup** via `server/seed/commodityIndexes.ts` to ensure Telegram scraper has required master records.
- `commodity_index_prices`: Historical price tracking with foreign key to indexes, storing price, delta, and timestamp

**Spot Positions System**: Internal synthetic spot trading support:
- `spot_positions`: Tracks user spot positions with fields: userId, commoditySlug, quantityKg, avgEntryPrice, createdAt, updatedAt. Allows multiple entries per user-commodity pair for flexible position management and API-level aggregation.
- `cropt_balances`: Stores internal CROPT balances for users (separate from on-chain balances). Used for synthetic spot trading settlement.
- **Dual Balance Architecture**: Two separate CROPT balances per user:
  - **On-chain balance**: Blockchain CROPT tokens (ERC-20 on Polygon Amoy testnet)
  - **Internal balance**: Database-stored CROPT for fast spot trading without gas fees
  - Users deposit from on-chain to internal balance via `POST /api/spot/deposit`
- **Spot Trading API**: Four endpoints for synthetic spot trading using CROPT as settlement token:
  - `POST /api/spot/deposit` - Deposit CROPT from on-chain to internal trading balance
  - `POST /api/spot/:commoditySlug/buy` - Buy commodity spot position using internal CROPT balance
  - `POST /api/spot/:commoditySlug/sell` - Sell commodity spot position, receive CROPT payout to internal balance
  - `GET /api/spot/:commoditySlug` - Get current position and P&L for commodity
  - `GET /api/spot/balance` - Get user's internal CROPT balance
  - `GET /api/spot/positions` - Get all user's spot positions with P&L calculations
- Prices sourced from commodity index system (converted from per-ton to per-kg)
- Position management uses weighted average costing for buys and FIFO (First In First Out) for sells
- Real-time P&L calculation based on current index prices

### UI/UX Decisions
The platform features Cropto branding, including a hero section, `MetricCards`, and a revamped header. It uses pill-shaped status badges and ensures responsiveness. Wallet connection is implemented with MetaMask integration and a manual input fallback.

**Hero Section**: Features updated branding with tagline "pricing, hedging and trading grain" (fully internationalized in EN/UK). Contains three CTA buttons:
- "Create Option" (primary green button)
- "Spot Trading" (secondary button with TrendingUp icon, smooth-scrolls to #spot-market-section)
- "Connect Wallet" (outline button with backdrop blur)

**Spot Market Section**: Polished visual design with professional UX/UI:
- Section wrapper: `py-12` vertical spacing, `text-3xl` headline with full i18n support (EN: "Spot Market", UK: "Спотовий ринок")
- Card layout: `rounded-xl` corners, `shadow-md` with `hover:shadow-lg`, `hover:scale-[1.01]` micro-interaction, `gap-5` grid spacing
- Enhanced typography: Larger commodity titles (`text-lg font-bold`), prominent price display (`text-2xl font-bold`), clear labels with i18n
- Button styling: "Buy" uses `bg-primary` with hover brightness, "Sell" uses `variant="secondary"` with neutral tone, both `size="default"` for consistency
- Animations: framer-motion fade-in for cards (staggered 50ms delay per card), smooth transitions (200ms duration)
- Responsive grid: 1 column mobile, 2 cols sm, 3 cols lg, 4 cols xl with `gap-5`
- All render states (loading, error, empty, success) include `id="spot-market-section"` anchor for smooth-scroll navigation from Hero CTA button
- Full i18n support: All text uses translation keys from `spot.market.*` namespace

### Key Features
- **Internationalization (i18n)**: Multi-language support using react-i18next with English and Ukrainian locales. Translation files located in `public/locales/{en,uk}/common.json`. Language switcher component in header allows seamless language toggling with localStorage persistence.
- **Commodity Index System**: Comprehensive commodity index management with 7 commodities (Corn, Wheat 11.5%, Feed Wheat, GMO Soybeans, GMO Soybeans (processing), Rapeseed, Sunflower Seed). Features include:
  - Real-time index grid display on homepage with latest prices and deltas
  - Individual index detail pages (`/index/:slug`) with full price history charts (Recharts LineChart)
  - Historical price entries table for each commodity
  - "Create Option" integration pre-filling commodity field with slug from index detail page
  - Manual price management (broker-only) via `/admin/index`
  - **Automated Telegram Scraper**: Background job (`server/jobs/telegramScraper.ts`) scrapes https://t.me/s/spike_brokers channel, processes HTML `<br>` tags to preserve line structure, parses all 7 commodity prices from Ukrainian Spike Brokers two-section format using `parseAllSpikeMessage()`, and inserts into `commodity_index_prices` table
  - **Multi-commodity Parser** (`server/services/telegramParser.ts`): Line-by-line parser with section context tracking (CPT ОДЕСА export vs CPT ПАРИТЕТ processing). Supports all 7 commodities with Ukrainian→English name mapping and context-aware slug assignment (Кукурудза→corn, Пшениця 11.5pro→wheat-115, Пшениця фураж→feed-wheat, Соя ГМО in export→gmo-soybeans, Соя ГМО in processing→gmo-soybeans-processing, Ріпак→rapeseed, Соняшник→sunflower-seed). Flexible regex handles both export format ("• Кукурудза – 209$ (0$)") and processing format with VAT marker ("• Ріпак – 592$ в т.ч. ПДВ (-1$)")
  - Automated updates via Telegram bot webhook (single commodity) and polling scraper (all commodities)
  - Support for simple format ("WHEAT 240.50") and Ukrainian Spike Brokers format ("• Пшениця 11.5pro – 221$ (0$)")
- **Option Creation & Management**: Users can create, view, filter, sort, and manually match crypto options (broker-only).
- **Exercise & Settlement**: Facilitates option exercise with spot price input, calculates payout, and records settlements.
- **Authentication & Authorization**: JWT-based system with user roles and protected API endpoints.
- **Wallet Integration**: MetaMask and manual input for wallet connection.
- **Blockchain & NFT Integration**: On-chain infrastructure for CROPT ERC-20 token on Polygon Amoy testnet, including minting and balance tracking. CroptOptionNFT ERC-721 contract allows tokenizing options as NFTs with metadata and explorer links.
- **Margin System**: Automated margin checks, margin calls, and collateral top-ups, including daily settlement and deadline processing for overdue margin calls.
- **Notifications System**: In-app notifications with read/unread status and navigation.
- **Admin & Portfolio Management**: Broker-only view for transaction reconciliation, and a comprehensive portfolio page with separated realized/unrealized P&L, locked collateral tracking, and detailed position analysis.
- **Demo & Feedback**: Idempotent demo data seeding system and a public feedback form.
- **Live Updates**: Polling-based live updates for real-time data changes, with user-scoped data filtering.
- **Demo Data Export/Import**: System for transferring demo training data (options, trades, settlements, etc.) from development to production database for demonstration purposes.

## Demo Data Migration

The platform includes scripts for exporting and importing demo data between development and production environments:

### Export Demo Data (Development)
Exports demo-marked data (isDemo='true') from development database to JSON file:
```bash
tsx scripts/export-demo-data.ts
```
Output: `demo-data-export.json` with filtered demo data (options, trades, settlements, index prices, margin calls, transactions)

### Import Demo Data (Production)
Imports demo data from JSON file to production database (requires published site shell access):
```bash
tsx scripts/import-demo-data.ts
```
Features:
- Uses database transactions for atomicity (all-or-nothing)
- Tracks imported vs skipped records
- Warns about conflicts and duplicate IDs
- Safe rollback on errors

**Security**: Export script filters only demo-linked records by optionId to prevent data leakage

## External Dependencies

- **Database**: Neon Serverless PostgreSQL
- **ORM**: Drizzle ORM
- **Frontend UI**: `shadcn/ui`, Radix UI primitives, Tailwind CSS, Lucide React
- **State Management**: TanStack Query
- **Form Handling & Validation**: React Hook Form, Zod
- **Routing**: Wouter
- **Wallet Integration**: `ethers.js`
- **Authentication**: `bcrypt`, `jsonwebtoken`
- **Internationalization**: `react-i18next`, `i18next`, `i18next-browser-languagedetector`
- **Utilities**: `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`, `nanoid`
- **Development Tools**: Vite, PostCSS, Autoprefixer, ESBuild