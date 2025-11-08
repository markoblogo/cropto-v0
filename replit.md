# Cropto - Crypto Options Trading Platform

## Overview

Cropto is a professional cryptocurrency options trading platform designed for creating and managing crypto options (calls and puts). It utilizes an off-chain order book system with a matching engine to facilitate trading. The platform provides a financial-focused interface for listing options, creating new contracts, matching buyers and sellers, and tracking trading activity. The business vision is to provide a robust and intuitive platform for crypto derivatives, offering users advanced trading capabilities and contributing to the broader adoption of regulated and efficient crypto options markets.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React and TypeScript, using Vite, `shadcn/ui` (Radix UI), and Tailwind CSS for a customizable financial-themed interface. State management uses TanStack Query and React Hook Form with Zod. Wouter handles client-side routing.

### Backend

The backend is an Express.js application in TypeScript, offering a RESTful JSON API. It features a flexible authentication system with Supabase (production) or file-based (`db.json`) for development, using bcrypt and JWT for security. It supports 'farmer', 'trader', and 'broker' roles. A database abstraction layer ensures transaction safety and prevents race conditions. Shared Zod schemas are used for data validation. A margin check job system calculates intrinsic value, P&L, triggers margin calls, and generates notifications. Security middleware blocks unauthorized Supabase service role key usage.

### Data Storage

The project uses PostgreSQL via Neon serverless driver with Drizzle ORM for schema management. Tables include `options`, `trades`, `settlements`, `margin_calls`, and `notifications`, designed with high-precision decimals and UUID primary keys.

### UI/UX Decisions

The platform features Cropto branding, including a hero section, `MetricCards`, and a revamped header. It uses pill-shaped status badges and ensures responsiveness. Wallet connection is implemented with MetaMask integration and a manual input fallback.

### Key Features

- **Index Price Widget**: Real-time display of commodity index prices with historical trends.
- **Option Creation & Management**: Users can create, view, filter, and sort crypto options.
- **Matching Engine**: Transaction-safe matching of buyers and sellers.
- **Exercise & Settlement**: Facilitates option exercise with spot price input.
- **Authentication & Authorization**: JWT-based system with user roles and protected API endpoints.
- **Wallet Integration**: MetaMask integration and manual input for wallet connection.
- **Blockchain Integration**: On-chain infrastructure for CROPT ERC-20 token on Polygon Amoy testnet, with minting and balance tracking.
- **Margin System**: Automated margin checks, margin calls, and collateral top-ups.
- **Daily Settlement**: Processes open options, calculating PnL and initiating margin calls.
- **Deadline Processing**: Automated system for processing expired margin calls and force-settling options.
- **Overdue Margin Call Processing**: Handles and settles expired margin calls, updating statuses and creating audit trails.
- **Notifications System**: In-app notifications with read/unread status and navigation.
- **Email Mock Service**: Server-side logging of email attempts for development.
- **Demo Seeding System**: Idempotent system for seeding demo data.
- **Partner Feedback System**: Public feedback form and admin view for managing suggestions.
- **Admin Reconciliation**: Broker-only view of transactions, settlements, and margin calls with filtering and export.
- **Portfolio & P&L Aggregation**: Comprehensive portfolio page displaying user's options positions and performance metrics.
- **Telegram Index Price Updates**: Automated index price updates via Telegram bot webhook.
- **Admin Index Management**: Broker-only page for manual index price management and Telegram webhook setup.

## External Dependencies

- **Database**: Neon Serverless PostgreSQL
- **ORM**: Drizzle ORM
- **Frontend UI**: `shadcn/ui`, Radix UI primitives, Tailwind CSS, Lucide React
- **State Management**: TanStack Query
- **Form Handling & Validation**: React Hook Form, Zod
- **Routing**: Wouter
- **Wallet Integration**: `ethers.js`
- **Authentication**: `bcrypt`, `jsonwebtoken`
- **Monitoring** (optional): Sentry
- **Utilities**: `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`, `nanoid`
- **Development Tools**: Vite, PostCSS, Autoprefixer, ESBuild