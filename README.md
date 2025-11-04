# Cropto - Crypto Options Trading Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-%3E%3D14.0-blue)](https://www.postgresql.org/)

> Professional off-chain cryptocurrency options trading platform with order book matching, settlement tracking, and institutional-grade interface.

![Cropto Platform](attached_assets/cropto%20cover2_1762265015324.png)

## Overview

Cropto enables sophisticated cryptocurrency options trading through an off-chain order book system. Users can create, match, exercise, and settle options contracts (calls and puts) with real-time order management and comprehensive P&L tracking.

### Key Features

- ✅ **Options Order Book**: Create CALL/PUT options with strike price, quantity, and premium
- ✅ **Matching Engine**: Transaction-safe matching with row-level locking prevents race conditions
- ✅ **Exercise & Settlement**: Calculate payouts and P&L with spot price inputs
- ✅ **Real-time Filtering**: Filter by type (CALL/PUT) and status (OPEN/FILLED/EXPIRED/CANCELLED)
- ✅ **Multi-column Sorting**: Sort by any column with tri-state (asc/desc/none)
- ✅ **Trade History**: Complete audit trail of all matched trades
- ✅ **Admin Pages**: Partners/contracts management and on-chain transaction monitoring
- ✅ **Design Gallery**: UI mockup showcase for future features
- ✅ **Light/Dark Mode**: Full theme support with Cropto olive accent (#9AA33A)

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for lightning-fast builds
- **TanStack Query** for server state management
- **Wouter** for lightweight routing
- **Shadcn/ui** + **Radix UI** for accessible components
- **Tailwind CSS** for utility-first styling

### Backend
- **Express.js** with TypeScript
- **Drizzle ORM** for type-safe database queries
- **PostgreSQL** (Neon Serverless) for data persistence
- **Zod** for runtime validation

## Quick Start

### Prerequisites

- **Node.js** 20.x or higher
- **PostgreSQL** 14+ (or Neon account)
- **npm** or **pnpm**

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd cropto

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`

### Environment Variables

Create a `.env` file with the following:

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Session Management
SESSION_SECRET=your-secure-random-string

# Node Environment
NODE_ENV=development
```

## Usage

### Creating Options

1. Navigate to the dashboard
2. Click "Create New Option"
3. Fill in the form:
   - **Title**: Option description
   - **Type**: CALL or PUT
   - **Strike Price**: Exercise price
   - **Quantity**: Number of contracts
   - **Premium**: Price per contract
   - **Buyer**: Your identifier
4. Submit to create the option (status: OPEN)

### Matching Options

1. Find an OPEN option in the table
2. Click the "Match" button
3. Enter seller identifier
4. Confirm to create the trade (status: FILLED)

### Exercising Options

1. Filter for FILLED options
2. Click the "Exercise" button
3. Enter current spot price
4. System calculates:
   - **CALL payout**: `max(0, spotPrice - strike) × qty`
   - **PUT payout**: `max(0, strike - spotPrice) × qty`
   - **P&L**: `payout - (premium × qty)`
5. Confirm to create settlement (status: EXPIRED)

### Filtering & Sorting

- **Filter by Type**: Use the type dropdown (All/CALL/PUT)
- **Filter by Status**: Use the status dropdown (All/OPEN/FILLED/EXPIRED/CANCELLED)
- **Sort Columns**: Click column headers to cycle through:
  - First click: Ascending
  - Second click: Descending
  - Third click: No sort (default order)

## Project Structure

```
cropto/
├── client/                 # Frontend application
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   │   └── ui/       # Shadcn/ui components
│   │   ├── pages/        # Page components
│   │   ├── lib/          # Utilities and helpers
│   │   ├── App.tsx       # App entry point
│   │   └── index.css     # Global styles
│   └── index.html         # HTML template
├── server/                # Backend application
│   ├── routes.ts         # API routes
│   ├── storage.ts        # Database abstraction
│   └── index.ts          # Server entry point
├── shared/
│   └── schema.ts         # Shared TypeScript types
├── attached_assets/       # User-uploaded assets
├── design-architecture.md # Design documentation
├── deployment.md         # Deployment guide
└── package.json
```

## API Documentation

### Health Check

```http
GET /api/health
```

**Response**:
```json
{"status": "ok"}
```

### Options

#### List Options
```http
GET /api/options
```

#### Create Option
```http
POST /api/options
Content-Type: application/json

{
  "title": "BTC Call Option",
  "type": "CALL",
  "strike": 50000.0,
  "qty": 1.5,
  "premium": 2000.0,
  "buyer": "trader@example.com"
}
```

#### Match Option
```http
POST /api/options/:id/match
Content-Type: application/json

{
  "seller": "counterparty@example.com"
}
```

#### Exercise Option
```http
POST /api/options/:id/exercise
Content-Type: application/json

{
  "spotPrice": 55000.0,
  "exercisedBy": "trader@example.com"
}
```

### Trades

```http
GET /api/trades
```

### Settlements

```http
GET /api/settlements
```

## Development

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database operations
npm run db:push        # Push schema to database
npm run db:studio      # Open Drizzle Studio
npm run db:push --force # Force schema sync

# Linting and formatting
npm run lint
npm run format
```

### Database Schema

See [`shared/schema.ts`](shared/schema.ts) for the complete schema definition.

**Key Tables**:
- `options`: Option contracts
- `trades`: Matched trades
- `settlements`: Exercise settlements

All monetary values use `decimal(18,8)` for precision.

### Migrating to Supabase

If you're migrating from file-based storage or an existing PostgreSQL database to Supabase:

#### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to provision
3. Navigate to **Settings** → **Database** to get your connection string

#### 2. Run SQL Migration

Execute the DDL script to create all tables:

```bash
# Option A: Using Supabase SQL Editor
# 1. Copy contents of db/migrations/001_init.sql
# 2. Paste into Supabase SQL Editor
# 3. Click "RUN"

# Option B: Using psql
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" \
  -f db/migrations/001_init.sql
```

#### 3. Set Environment Variables

Add these to your Replit Secrets or `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
SUPABASE_KEY=[YOUR-SERVICE-ROLE-KEY]  # NOT the anon key!

# Database Connection (for Drizzle ORM)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres

# Optional: Keep file-based mode as fallback
# DB_MODE=filedb
```

**Important**: Use the **service_role** key (not the `anon` key) for `SUPABASE_KEY`. Find it in:
**Settings** → **API** → **Project API keys** → **service_role**

#### 4. Migrate Data

Run the migration script to transfer existing data:

```bash
node server/scripts/migrateToSupabase.js
```

This script will:
- ✅ Migrate users from `server/db.json`
- ✅ Migrate existing PostgreSQL data (options, trades, settlements, etc.)
- ✅ Skip duplicate entries
- ✅ Verify migration completion

**Output Example**:
```
=== Migrating Users ===
✓ Migrated user: farmer@demo
✓ Migrated user: trader@demo
✓ Migrated user: broker@demo

Users migration complete: 3 migrated, 0 skipped

=== Migrating PostgreSQL Data ===
✓ options: 15/15 rows migrated
✓ trades: 8/8 rows migrated

=== Verifying Migration ===
ℹ users: 3 rows
ℹ options: 15 rows
ℹ trades: 8 rows
```

#### 5. Test the Migration

```bash
# Restart the application
npm run dev

# Verify:
# 1. Login still works
# 2. Options display correctly
# 3. Create a new option
# 4. Match and exercise options
```

#### 6. Cleanup (Optional)

After confirming everything works:

```bash
# Backup file-based database
cp server/db.json server/db.json.backup

# Remove file-based mode (if set)
# Remove DB_MODE=filedb from environment variables
```

#### Fallback Mode

To temporarily revert to file-based storage:

```env
DB_MODE=filedb
```

This keeps users in `server/db.json` without connecting to Supabase.

## Design System

### Brand Colors

- **Olive Accent**: `#9AA33A` (HSL: 65, 47%, 42%)
- Applied to primary and accent color tokens
- Consistent across light and dark themes

### Typography

- **Inter**: Body text and UI elements
- **JetBrains Mono**: Numerical values and data

### Component Library

Built on **Shadcn/ui** and **Radix UI**:
- Accessible by default
- Customizable with Tailwind
- Consistent design language
- Full keyboard navigation

See [`design-architecture.md`](design-architecture.md) for complete design documentation.

## Deployment

### Replit (Recommended)

1. Ensure environment secrets are configured
2. Click "Publish" in Replit interface
3. Replit handles build, HTTPS, and domain setup

### Manual Deployment

See [`deployment.md`](deployment.md) for comprehensive deployment instructions including:
- VPS/Cloud deployment
- Docker deployment
- Database setup and migration
- Nginx configuration
- HTTPS setup with Let's Encrypt
- Monitoring and logging

## Testing

```bash
# Run tests (when available)
npm test

# Run E2E tests
npm run test:e2e
```

## Roadmap

### Upcoming Features

- [ ] **Commodity Fields**: Instrument type, lot size, collateral requirements
- [ ] **Margin Call System**: Automated margin monitoring and notifications
- [ ] **Real-Time Updates**: WebSocket integration for live data
- [ ] **Advanced Analytics**: P&L charts, trading volume metrics
- [ ] **User Authentication**: Multi-user support with role-based access
- [ ] **Order Book Depth**: Visual representation of bid/ask levels
- [ ] **Mobile App**: React Native application

### Technical Improvements

- [ ] Replace `parseFloat` with `Decimal.js` for precision
- [ ] Comprehensive test suite (unit, integration, E2E)
- [ ] CI/CD pipeline
- [ ] Performance monitoring
- [ ] Error tracking (Sentry)
- [ ] API rate limiting
- [ ] Request logging

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

### Reporting Vulnerabilities

Please report security vulnerabilities to: security@cropto.io

### Best Practices

- All secrets stored in environment variables
- Input validation with Zod schemas
- SQL injection prevention via ORM
- HTTPS in production
- Regular dependency audits

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Shadcn/ui** for the component library
- **Radix UI** for accessible primitives
- **Neon** for serverless PostgreSQL
- **Replit** for the development platform

## Support

- **Documentation**: See `design-architecture.md` and `deployment.md`
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Email**: support@cropto.io

---

**Version**: 1.0.0  
**Last Updated**: November 4, 2025

Built with ❤️ by the Cropto team
