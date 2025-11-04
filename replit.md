# Cropto - Crypto Options Trading Platform

## Overview

Cropto is a professional cryptocurrency options trading platform that enables users to create and manage crypto options (calls and puts) through an off-chain order book system with a matching engine. The application provides a clean, financial-focused interface for viewing options listings, creating new options contracts, matching buyers with sellers, filtering and sorting options, and tracking trading activity.

## Recent Changes (November 4, 2025)

### Completed Features
1. **Table Filtering and Sorting** - Users can filter options by type (CALL/PUT) and status (OPEN/FILLED/EXPIRED/CANCELLED), and sort by any column with ascending/descending/none states
2. **Option Matching Engine** - Implemented transaction-safe matching that pairs buyers with sellers, creates trade records, and updates option status to FILLED with row-level locking to prevent race conditions
3. **Exercise and Settlement Workflow** - Filled options can be exercised with spot price input, calculates payouts and P&L, creates settlement records, updates status to EXPIRED. Supports both CALL and PUT options with proper payout formulas

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool and development server

**UI Component System**: shadcn/ui (Radix UI primitives) with Tailwind CSS
- Design philosophy follows financial trading platforms (Robinhood, Coinbase, Binance)
- Custom theme system with light/dark mode support
- Material Design principles for data-rich interfaces
- Typography: Inter for body text, JetBrains Mono for numerical values

**State Management**:
- TanStack Query (React Query) for server state management
- Form state handled by React Hook Form with Zod validation
- Local component state with React hooks

**Routing**: Wouter for lightweight client-side routing

**Key Design Decisions**:
- Chose shadcn/ui over component libraries for maximum customization
- Prioritized data legibility and quick scanning for financial data
- Implemented consistent spacing system (2, 4, 6, 8 Tailwind units)
- Used monospace fonts for numerical values to ensure alignment

### Backend Architecture

**Framework**: Express.js with TypeScript running on Node.js

**API Design**: RESTful JSON API
- `/api/health` - Health check endpoint
- `/api/options` - GET (list all options) and POST (create new option)
- `/api/options/:id/match` - POST (match an option with a seller, creates trade)
- `/api/options/:id/exercise` - POST (exercise a filled option with spot price, creates settlement)
- `/api/trades` - GET (list all trades)
- `/api/settlements` - GET (list all settlements)

**Data Validation**: Zod schemas shared between frontend and backend
- Schema definitions in `shared/schema.ts`
- Runtime validation with `zod-validation-error` for user-friendly error messages
- Decimal precision handling for financial values (18 digits, 8 decimal places)

**Storage Layer**: Database abstraction through IStorage interface
- Separates business logic from data access
- DatabaseStorage implementation provides CRUD operations
- Transaction-safe matching engine with row-level locking
- Prevents race conditions during option matching
- Enables easy testing and future storage backend changes

**Key Design Decisions**:
- Monorepo structure with shared types between client and server
- TypeScript path aliases for clean imports (@/, @shared/)
- Middleware for request logging and JSON body parsing with raw body access
- ESM modules throughout for modern JavaScript support

### Data Storage

**Database**: PostgreSQL (via Neon serverless driver)

**ORM**: Drizzle ORM
- Schema-first approach with TypeScript inference
- Migration support through drizzle-kit
- Serverless-optimized with connection pooling

**Schema Design**:
```typescript
options table:
  - id: UUID (auto-generated primary key)
  - title: text (option description)
  - type: enum (CALL, PUT)
  - strike: decimal(18,8) (strike price)
  - qty: decimal(18,8) (quantity)
  - premium: decimal(18,8) (premium amount)
  - buyer: text (buyer identifier)
  - seller: text (seller identifier, null until matched)
  - status: enum (OPEN, FILLED, EXPIRED, CANCELLED)
  - createdAt: timestamp (auto-generated)

trades table:
  - id: UUID (auto-generated primary key)
  - optionId: UUID (foreign key to options)
  - buyer: text (buyer identifier)
  - seller: text (seller identifier)
  - strike: decimal(18,8) (strike price at time of trade)
  - qty: decimal(18,8) (quantity traded)
  - premium: decimal(18,8) (premium per unit)
  - totalValue: decimal(18,8) (total trade value)
  - createdAt: timestamp (auto-generated)

settlements table:
  - id: UUID (auto-generated primary key)
  - optionId: UUID (foreign key to options)
  - exercisedBy: text (user who exercised)
  - spotPrice: decimal(18,8) (market price at exercise)
  - strike: decimal(18,8) (strike price at exercise)
  - qty: decimal(18,8) (quantity exercised)
  - payout: decimal(18,8) (calculated payout amount)
  - profitLoss: decimal(18,8) (net profit or loss after premium)
  - createdAt: timestamp (auto-generated)
```

**Key Design Decisions**:
- High-precision decimals (18,8) for cryptocurrency amounts
- Enum types for constrained values (option type, status)
- Timestamps for audit trail and ordering
- UUID primary keys for distributed system compatibility

### External Dependencies

**Database Service**: Neon Serverless PostgreSQL
- WebSocket-based connection for serverless environments
- Connection pooling via @neondatabase/serverless
- Environment variable: `DATABASE_URL`

**UI Component Libraries**:
- Radix UI primitives for accessible, unstyled components
- Embla Carousel for potential carousel features
- Lucide React for icons

**Development Tools**:
- Vite plugins for Replit integration (cartographer, dev banner, runtime error overlay)
- PostCSS with Tailwind CSS and Autoprefixer
- ESBuild for production server bundling

**Validation & Forms**:
- Zod for schema validation
- React Hook Form for form state management
- @hookform/resolvers for Zod integration

**Utility Libraries**:
- date-fns for date formatting
- clsx and tailwind-merge (via cn utility) for conditional styling
- class-variance-authority for component variant management
- nanoid for unique ID generation

**Key Design Decisions**:
- Minimal external dependencies to reduce bundle size
- Shared validation schemas between client and server
- Google Fonts (Inter, JetBrains Mono) loaded via CDN
- WebSocket constructor injection for Neon compatibility in Node.js environment