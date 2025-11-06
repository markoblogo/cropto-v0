# Cropto - Crypto Options Trading Platform

## Overview

Cropto is a professional cryptocurrency options trading platform designed for creating and managing crypto options (calls and puts). It utilizes an off-chain order book system with a matching engine to facilitate trading. The platform provides a financial-focused interface for listing options, creating new contracts, matching buyers and sellers, and tracking trading activity. The business vision is to provide a robust and intuitive platform for crypto derivatives, offering users advanced trading capabilities and contributing to the broader adoption of regulated and efficient crypto options markets.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript, using Vite for development and bundling. It employs `shadcn/ui` (built on Radix UI primitives) and Tailwind CSS for a highly customizable UI that follows financial trading platform aesthetics. Key design decisions include prioritizing data legibility, consistent spacing, and using monospace fonts for numerical values. State management is handled by TanStack Query for server state and React Hook Form with Zod for form management. Wouter is used for client-side routing.

### Backend Architecture

The backend is an Express.js application written in TypeScript, providing a RESTful JSON API. It uses a file-based user authentication system with bcrypt hashing and JWT tokens for security, supporting 'farmer', 'trader', and 'broker' roles. A database abstraction layer (`IStorage`) with a `DatabaseStorage` implementation handles CRUD operations, ensuring transaction safety and preventing race conditions during option matching. Shared Zod schemas between frontend and backend (`shared/schema.ts`) are used for robust data validation. The system also includes a margin check job system that calculates intrinsic value, P&L, triggers margin calls, and generates notifications.

### Data Storage

The project uses PostgreSQL via Neon serverless driver, with Drizzle ORM for schema management and interactions. The schema includes tables for `options`, `trades`, `settlements`, `margin_calls`, and `notifications`, designed with high-precision decimals (18,8) for financial values, enum types for constrained data, and UUID primary keys.

### UI/UX Decisions

The platform features a comprehensive visual refresh with Cropto branding, including a hero section, `MetricCards`, and a revamped header. It utilizes pill-shaped status badges with custom brand colors. The design architecture page (`/design-architecture`) showcases design mockups and brand assets, ensuring responsiveness across various viewports. Wallet connection is implemented with MetaMask integration and a manual input fallback.

### Feature Specifications

- **Index Price Widget**: Real-time dashboard widget displays latest wheat index price with historical trend. Shows commodity name, current price (formatted USD), change percentage with color-coded trend indicator (green/red/gray), and sparkline chart. API endpoint `GET /api/index/latest` fetches latest price and last 7 historical data points from database. Widget auto-refreshes every 30 seconds and handles loading/error states. Integrated into dashboard in responsive grid layout.
- **Option Creation & Management**: Users can create, view, filter, and sort crypto options (CALL/PUT) by various statuses (OPEN/FILLED/EXPIRED/CANCELLED).
- **Matching Engine**: Transaction-safe matching pairs buyers with sellers, updates option status, and creates trade records.
- **Exercise & Settlement**: Filled options can be exercised with spot price input, calculating payouts and P&L, and creating settlement records.
- **Authentication & Authorization**: JWT-based authentication with user roles (farmer, trader, broker) and protected API endpoints.
- **Wallet Integration**: MetaMask integration with a fallback for manual wallet address input, linking wallet addresses to user accounts.
- **Margin System**: Automated margin check job calculates intrinsic value, P&L, triggers margin calls, and creates notifications. Users can top up reserved collateral for margin calls via `TopUpMarginCallDialog` component. Top-up button appears only for options owned by the current user with MARGIN_CALL status. Supports CROPT or FIAT currency. Partial top-ups increase reserved collateral; full top-ups (when reservedCollateral >= amountRequired) resolve the margin call and restore option status to OPEN. Query invalidation ensures UI updates after successful top-up.
- **Daily Settlement**: `POST /api/jobs/daily-settle` endpoint processes OPEN options at a given index price. For each option, it calculates PnL and checks if it exceeds 0.8 * collateral. When threshold is breached, creates margin call with 24h deadline and updates option status to MARGIN_CALL. Returns detailed processing results including marginCalls array, processedOptions, and errors.
- **Deadline Processing**: Automated system processes expired margin calls using scheduler module (server/cron/scheduler.ts). Manual trigger endpoint `POST /api/admin/schedule/process-deadlines` (broker-only) finds margin calls with past deadlines, force-settles options to DEFAULTED status, updates margin call status to LIQUIDATED, and creates notifications. Uses storage abstraction layer for transaction safety and business logic consistency.
- **Overdue Margin Call Processing**: `POST /api/jobs/process-overdue-margincalls` endpoint (broker-only) processes expired margin calls with detailed settlement records. Calculates net payout as max(0, intrinsicValue - totalAvailableCollateral), creates settlement and transaction records with full audit trail (including collateral applied, intrinsic value, and deadline), updates option status to DEFAULTED, margin call status to LIQUIDATED, and sends notifications to affected parties. Returns summary with processedCount, expiredMarginCalls, processedOptions (including payout, collateralApplied, intrinsicValue), and errors.
- **Notifications System**: In-app notification system with bell icon showing unread count. Notifications can be marked as read by clicking, with automatic navigation to related options. API endpoints: `GET /api/notifications` (supports ?unread=true filter), `POST /api/notifications/:id/mark-read`, and `POST /api/notifications/send-mock` (broker-only for testing).
- **Email Mock Service**: Server-side email logging service (server/utils/emailMock.ts) that logs all email attempts to files in logs/email-log-<timestamp>.log and console. Integrated with margin check job to send email notifications when new margin calls are created.
- **Demo Seeding System**: An idempotent system to seed demo data (users, options, index prices) for reproducible testing and demonstrations.
- **Partner Feedback System**: Public feedback form at /feedback allows partners to submit UI/UX issues and suggestions without authentication. Admin view at /admin/feedback (broker-only) displays all feedback with resolve functionality and CSV export capability. Feedback table stores name, email, role, message, optional screenshot URL, and status (open/resolved).
- **Admin Reconciliation**: Broker-only page at /admin/reconciliation provides comprehensive view of all transactions, settlements, and margin calls. Features include date range filtering, status filtering for margin calls, tabbed interface for different record types, and CSV export capability for each type. Frontend enforces broker-only access with redirect and error handling. Backend endpoints (`GET /api/admin/reconciliation/transactions`, `/settlements`, `/margincalls`) require broker authentication and return properly formatted data. Each tab displays records in tables with proper formatting, status badges, and loading/error states.

## External Dependencies

- **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- **ORM**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Frontend UI**: `shadcn/ui`, Radix UI primitives, Tailwind CSS, Lucide React (icons)
- **State Management**: TanStack Query (React Query)
- **Form Handling & Validation**: React Hook Form, Zod (`zod`, `@hookform/resolvers`)
- **Routing**: Wouter
- **Wallet Integration**: `ethers.js`
- **Authentication**: `bcrypt`, `jsonwebtoken`
- **Utilities**: `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`, `nanoid`
- **Development Tools**: Vite, PostCSS, Autoprefixer, ESBuild