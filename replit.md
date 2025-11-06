# Cropto - Crypto Options Trading Platform

## Overview

Cropto is a professional cryptocurrency options trading platform designed for creating and managing crypto options (calls and puts). It utilizes an off-chain order book system with a matching engine to facilitate trading. The platform provides a financial-focused interface for listing options, creating new contracts, matching buyers and sellers, and tracking trading activity. The business vision is to provide a robust and intuitive platform for crypto derivatives, offering users advanced trading capabilities and contributing to the broader adoption of regulated and efficient crypto options markets.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript, using Vite for development and bundling. It employs `shadcn/ui` (built on Radix UI primitives) and Tailwind CSS for a highly customizable UI that follows financial trading platform aesthetics. Key design decisions include prioritizing data legibility, consistent spacing, and using monospace fonts for numerical values. State management is handled by TanStack Query for server state and React Hook Form with Zod for form management. Wouter is used for client-side routing.

### Backend Architecture

The backend is an Express.js application written in TypeScript, providing a RESTful JSON API. It features a flexible authentication system with dual-mode support: Supabase for production (when `SUPABASE_URL` configured) or file-based (`db.json`) for development/testing. Authentication uses bcrypt hashing and JWT tokens for security, supporting 'farmer', 'trader', and 'broker' roles. A database abstraction layer (`IStorage`) with a `DatabaseStorage` implementation handles CRUD operations, ensuring transaction safety and preventing race conditions during option matching. Shared Zod schemas between frontend and backend (`shared/schema.ts`) are used for robust data validation. The system also includes a margin check job system that calculates intrinsic value, P&L, triggers margin calls, and generates notifications.

### Data Storage

The project uses PostgreSQL via Neon serverless driver, with Drizzle ORM for schema management and interactions. The schema includes tables for `options`, `trades`, `settlements`, `margin_calls`, and `notifications`, designed with high-precision decimals (18,8) for financial values, enum types for constrained data, and UUID primary keys.

### UI/UX Decisions

The platform features a comprehensive visual refresh with Cropto branding, including a hero section, `MetricCards`, and a revamped header. It utilizes pill-shaped status badges with custom brand colors. The design architecture page (`/design-architecture`) showcases design mockups and brand assets, ensuring responsiveness across various viewports. Wallet connection is implemented with MetaMask integration and a manual input fallback.

### Feature Specifications

- **Index Price Widget**: Real-time dashboard widget displays latest wheat index price with historical trend. Shows commodity name, current price (formatted USD), change percentage with color-coded trend indicator (green/red/gray), and sparkline chart. API endpoint `GET /api/index/latest` fetches latest price and last 7 historical data points from database. Widget auto-refreshes every 30 seconds and handles loading/error states. Integrated into dashboard in responsive grid layout.
- **Option Creation & Management**: Users can create, view, filter, and sort crypto options (CALL/PUT) by various statuses (OPEN/FILLED/EXPIRED/CANCELLED).
- **Matching Engine**: Transaction-safe matching pairs buyers with sellers, updates option status, and creates trade records.
- **Exercise & Settlement**: Filled options can be exercised with spot price input, calculating payouts and P&L, and creating settlement records.
- **Authentication & Authorization**: Flexible JWT-based authentication system supporting two storage modes: Supabase (production) when SUPABASE_URL configured, or file-based db.json (development). Supports user roles (farmer, trader, broker) with protected API endpoints. Automatic mode switching based on environment configuration ensures seamless deployment across different environments.
- **Wallet Integration**: Fully implemented wallet connection system in Header component with MetaMask browser integration and manual address input fallback. API endpoints: `POST /api/wallet/link` links wallet address to user account, `GET /api/wallet/me` retrieves current user's wallet info. User schema includes optional `walletAddress` and `network` fields stored in user profile. After connection, formatted wallet address (0x1234...5678) displays in header.
- **Blockchain Integration**: Complete on-chain infrastructure for CROPT ERC-20 token on Polygon Mumbai. Smart contract (`contracts/Cropt.sol`) with OpenZeppelin standards (ERC20, Burnable, AccessControl, Minter role). Hardhat deployment configured for Mumbai testnet. Backend: mint API at `POST /api/onchain/mint` signs transactions using DEPLOYER_PRIVATE_KEY, transaction poller (`server/onchain/poller.ts`) updates pending transactions every 15s, `onchain_transactions` table tracks all blockchain operations. Frontend: Web3Context provides ethers.js wallet connection with CROPT balance display, WithdrawDialog allows users to mint tokens to their connected wallet with transaction tracking, Header shows both wallet address and real-time CROPT balance via `GET /api/onchain/balance/:address`.
- **Margin System**: Automated margin check job calculates intrinsic value, P&L, triggers margin calls, and creates notifications. Users can top up reserved collateral for margin calls via `TopUpMarginCallDialog` component. Top-up button appears only for options owned by the current user with MARGIN_CALL status. Supports CROPT or FIAT currency. Partial top-ups increase reserved collateral; full top-ups (when reservedCollateral >= amountRequired) resolve the margin call and restore option status to OPEN. Query invalidation ensures UI updates after successful top-up.
- **Daily Settlement**: `POST /api/jobs/daily-settle` endpoint processes OPEN options at a given index price. For each option, it calculates PnL and checks if it exceeds 0.8 * collateral. When threshold is breached, creates margin call with 24h deadline and updates option status to MARGIN_CALL. Returns detailed processing results including marginCalls array, processedOptions, and errors.
- **Deadline Processing**: Automated system processes expired margin calls using scheduler module (server/cron/scheduler.ts). Manual trigger endpoint `POST /api/admin/schedule/process-deadlines` (broker-only) finds margin calls with past deadlines, force-settles options to DEFAULTED status, updates margin call status to LIQUIDATED, and creates notifications. Uses storage abstraction layer for transaction safety and business logic consistency.
- **Overdue Margin Call Processing**: `POST /api/jobs/process-overdue-margincalls` endpoint (broker-only) processes expired margin calls with detailed settlement records. Calculates net payout as max(0, intrinsicValue - totalAvailableCollateral), creates settlement and transaction records with full audit trail (including collateral applied, intrinsic value, and deadline), updates option status to DEFAULTED, margin call status to LIQUIDATED, and sends notifications to affected parties. Returns summary with processedCount, expiredMarginCalls, processedOptions (including payout, collateralApplied, intrinsicValue), and errors.
- **Notifications System**: In-app notification system with bell icon showing unread count. Notifications can be marked as read by clicking, with automatic navigation to related options. API endpoints: `GET /api/notifications` (supports ?unread=true filter), `POST /api/notifications/:id/mark-read`, and `POST /api/notifications/send-mock` (broker-only for testing).
- **Email Mock Service**: Server-side email logging service (server/utils/emailMock.ts) that logs all email attempts to files in logs/email-log-<timestamp>.log and console. Integrated with margin check job to send email notifications when new margin calls are created.
- **Demo Seeding System**: An idempotent system to seed demo data (users, options, index prices) for reproducible testing and demonstrations.
- **Partner Feedback System**: Public feedback form at /feedback allows partners to submit UI/UX issues and suggestions without authentication. Admin view at /admin/feedback (broker-only) displays all feedback with resolve functionality and CSV export capability. Feedback table stores name, email, role, message, optional screenshot URL, and status (open/resolved).
- **Admin Reconciliation**: Broker-only page at /admin/reconciliation provides comprehensive view of all transactions, settlements, and margin calls. Features include date range filtering, status filtering for margin calls, tabbed interface for different record types, and CSV export capability for each type. Frontend enforces broker-only access with redirect and error handling. Backend endpoints (`GET /api/admin/reconciliation/transactions`, `/settlements`, `/margincalls`) require broker authentication and return properly formatted data. Each tab displays records in tables with proper formatting, status badges, and loading/error states.
- **Portfolio & P&L Aggregation**: Comprehensive portfolio page at /portfolio displays user's complete options positions and performance metrics. Backend API `GET /api/portfolio/me` aggregates all options where user is buyer or seller, calculates realized P&L from settlements and unrealized P&L from current index prices. Frontend displays four metric cards (Total P&L with trend indicator, Open Positions count, Locked Collateral, Margin Calls count) and positions table showing all options with individual P&L, role (buyer/seller), status, and unrealized/realized indicators. PnL calculation correctly handles both buyer and seller perspectives: buyer PnL = intrinsicValue - premium, seller PnL = premium - intrinsicValue. Storage layer includes `getOptionsByUser` method filtering options by buyer OR seller using Drizzle's `or()` operator. Portfolio accessible via header navigation link.
- **Telegram Index Price Updates**: Automated index price updates via Telegram bot webhook. API endpoint `POST /api/index` accepts Telegram messages in format "COMMODITY PRICE" (e.g., "WHEAT 240.50"), validates request using `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_BOT_SECRET_TOKEN` environment secret. Returns 503 if secret not configured, 401 if token invalid. Validates commodity name is alphanumeric and price is positive number. Successfully authenticated requests create new index price records.
- **Admin Index Management**: Broker-only admin page at /admin/index for manual index price management and Telegram webhook setup. Displays webhook URL, required secret token header, and message format instructions. Admin form allows manual commodity/price entry with real-time validation. Lists all historical index prices with filtering by commodity and pagination. GET endpoint `/api/admin/index` retrieves index prices (optional commodity filter), POST endpoint `/api/admin/index` allows manual creation with broker authentication. useEffect-based redirect enforces broker role access.

## CI/CD & Monitoring

### Continuous Integration

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request:
- Automated test suite execution with Jest
- Application build verification
- Health check endpoint validation (`/api/health`)
- PostgreSQL integration testing

### Error Monitoring

Minimal Sentry integration configured in `server/utils/sentry.ts`:
- Safe no-op initialization when `SENTRY_DSN` not configured
- Ready to enable full error tracking by:
  1. Installing packages: `npm install --legacy-peer-deps @sentry/node @sentry/profiling-node`
  2. Adding `SENTRY_DSN` to Replit Secrets
  3. Uncommenting initialization code in `server/utils/sentry.ts`
- Supports error capture, performance monitoring, and profiling when enabled

### Documentation

- `docs/api-examples.md`: Comprehensive curl command examples for all API endpoints with authentication, wallet management, options trading, portfolio, blockchain operations, and admin functions
- `docs/monitoring.md`: Comprehensive monitoring and CI/CD setup guide
- `docs/supabase-migration.md`: Complete guide for migrating user authentication from file-based storage to Supabase
- `pilot_onboarding.md`: End-to-end onboarding guide for pilot users with steps to get test CROPT tokens
- `scripts/supabase-schema.sql`: SQL schema for creating users table in Supabase
- `scripts/migrateToSupabase.ts`: Automated migration script to transfer users from db.json to Supabase

## External Dependencies

- **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- **ORM**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Frontend UI**: `shadcn/ui`, Radix UI primitives, Tailwind CSS, Lucide React (icons)
- **State Management**: TanStack Query (React Query)
- **Form Handling & Validation**: React Hook Form, Zod (`zod`, `@hookform/resolvers`)
- **Routing**: Wouter
- **Wallet Integration**: `ethers.js`
- **Authentication**: `bcrypt`, `jsonwebtoken`
- **Monitoring** (optional): Sentry (`@sentry/node`, `@sentry/profiling-node`)
- **Utilities**: `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`, `nanoid`
- **Development Tools**: Vite, PostCSS, Autoprefixer, ESBuild