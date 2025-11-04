# Cropto Design & Architecture Documentation

## Overview

Cropto is a professional cryptocurrency options trading platform designed with a focus on clarity, speed, and institutional-grade data presentation. The platform enables off-chain options trading with an order book matching engine, exercising capabilities, and settlement tracking.

## Design Philosophy

### Brand Identity

**Cropto Brand Color**: Olive Accent `#9AA33A` (HSL: 65, 47%, 42%)
- Primary and accent colors use the signature olive tone
- Represents growth, stability, and financial prudence
- Applied consistently across light and dark themes

**Typography**:
- **Inter**: Body text, headings, and general UI elements
- **JetBrains Mono**: Numerical values, prices, quantities, and financial data

This dual-font system ensures:
- Professional readability for general content
- Precise alignment for numerical columns
- Clear visual hierarchy between text and data

### Visual Design Principles

**Data-First Interface**:
Following patterns from Robinhood, Coinbase, and Binance, Cropto prioritizes:
1. **Scannability**: Quick recognition of option types, prices, and statuses
2. **Density**: Maximum information without overwhelming the user
3. **Precision**: Monospace fonts ensure numerical alignment
4. **Clarity**: Consistent spacing and visual hierarchy

**Light & Dark Mode Support**:
- Full theme support with custom color tokens
- Olive accent remains visible in both modes
- Proper contrast ratios for accessibility

**Component Consistency**:
- Shadcn/ui components for baseline UI elements
- Radix UI primitives for accessibility
- Tailwind CSS for utility-first styling
- Custom elevation system (hover-elevate, active-elevate-2)

## Architecture Overview

### Technology Stack

**Frontend**:
- React 18 with TypeScript
- Vite for build tooling and development
- Wouter for lightweight routing
- TanStack Query for server state management
- React Hook Form + Zod for form validation

**Backend**:
- Express.js with TypeScript
- RESTful API design
- Drizzle ORM for database operations
- PostgreSQL (Neon Serverless) for data persistence

**UI Framework**:
- Tailwind CSS for utility-first styling
- Shadcn/ui component library
- Radix UI primitives
- Lucide React for icons

### Database Schema

**Options Table**:
```typescript
options {
  id: UUID (primary key)
  title: text
  type: enum (CALL, PUT)
  strike: decimal(18,8)
  qty: decimal(18,8)
  premium: decimal(18,8)
  buyer: text
  seller: text (nullable)
  status: enum (OPEN, FILLED, EXPIRED, CANCELLED)
  createdAt: timestamp
}
```

**Trades Table**:
```typescript
trades {
  id: UUID (primary key)
  optionId: UUID (foreign key)
  buyer: text
  seller: text
  strike: decimal(18,8)
  qty: decimal(18,8)
  premium: decimal(18,8)
  totalValue: decimal(18,8)
  createdAt: timestamp
}
```

**Settlements Table**:
```typescript
settlements {
  id: UUID (primary key)
  optionId: UUID (foreign key)
  exercisedBy: text
  spotPrice: decimal(18,8)
  strike: decimal(18,8)
  qty: decimal(18,8)
  payout: decimal(18,8)
  profitLoss: decimal(18,8)
  createdAt: timestamp
}
```

### API Endpoints

**Options Management**:
- `GET /api/options` - List all options with filtering
- `POST /api/options` - Create new option
- `POST /api/options/:id/match` - Match buyer with seller
- `POST /api/options/:id/exercise` - Exercise filled option

**Trading & Settlement**:
- `GET /api/trades` - List all trades
- `GET /api/settlements` - List all settlements

**System**:
- `GET /api/health` - Health check endpoint

### Core Features

#### 1. Options Order Book
- Create CALL or PUT options with strike price, quantity, and premium
- Open options displayed in real-time table
- Filter by type (CALL/PUT) and status (OPEN/FILLED/EXPIRED/CANCELLED)
- Sort by any column with tri-state (asc/desc/none)

#### 2. Matching Engine
- Transaction-safe matching with row-level locking
- Pairs buyers with sellers automatically
- Creates trade records with full audit trail
- Updates option status to FILLED atomically

#### 3. Exercise & Settlement
- Filled options can be exercised with spot price input
- Automatic payout calculation:
  - **CALL**: `max(0, spotPrice - strike) × qty`
  - **PUT**: `max(0, strike - spotPrice) × qty`
- Profit/Loss calculation includes premium paid
- Settlement records persist all exercise details

#### 4. Admin Pages
- **Partners & Contracts**: Institutional partnership management
- **On-Chain Transactions**: Blockchain settlement monitoring

#### 5. Design Gallery
- UI mockup showcase at `/design-architecture`
- Reference designs for future features

## Design System

### Color Tokens

**Light Mode**:
```css
--background: 0 0% 100%
--foreground: 220 8% 12%
--card: 0 0% 100%
--primary: 65 47% 42% (Olive)
--accent: 65 47% 42% (Olive)
--muted: 220 12% 89%
```

**Dark Mode**:
```css
--background: 220 12% 8%
--foreground: 220 6% 92%
--card: 220 12% 10%
--primary: 65 47% 42% (Olive)
--accent: 65 47% 42% (Olive)
--muted: 220 12% 16%
```

### Spacing System
- **Small**: 2-4 Tailwind units (0.5rem - 1rem)
- **Medium**: 4-6 Tailwind units (1rem - 1.5rem)
- **Large**: 6-8 Tailwind units (1.5rem - 2rem)

### Component Patterns

**Tables**:
- Monospace fonts for numerical columns
- Status badges for visual state indication
- Sortable headers with tri-state sorting
- Filters for type and status
- Responsive layout with horizontal scroll

**Forms**:
- Zod validation schemas
- React Hook Form integration
- Real-time validation feedback
- Disabled state during submission

**Cards**:
- Consistent padding (p-6)
- Header/Content separation
- Elevation on hover (where appropriate)

## Future Enhancements

### Planned Features
1. **Commodity-Specific Fields**: Instrument, commodity type, lot size, collateral requirements
2. **Margin Call System**: Automated margin monitoring and top-up notifications
3. **Real-Time Updates**: WebSocket integration for live option updates
4. **Advanced Filtering**: Date ranges, price ranges, multi-select filters
5. **Analytics Dashboard**: Trading volume, P&L charts, performance metrics
6. **User Authentication**: Multi-user support with role-based access control

### Technical Debt
1. Replace `parseFloat` with proper `Decimal.js` for precision
2. Add comprehensive error handling and retry logic
3. Implement proper logging and monitoring
4. Add unit and integration tests
5. Set up CI/CD pipeline

## Performance Considerations

**Database Optimization**:
- Row-level locking prevents race conditions
- Transaction-safe matching engine
- Indexed foreign keys for query performance

**Frontend Optimization**:
- TanStack Query for efficient caching
- Optimistic updates for better UX
- Lazy loading for routes
- Debounced form inputs

**Bundle Size**:
- Vite code splitting
- Tree-shaking for unused code
- Font subsetting for Google Fonts
- Minimal external dependencies

## Security

**Current Measures**:
- Environment-based secrets (SESSION_SECRET, DATABASE_URL)
- Input validation with Zod schemas
- SQL injection prevention via ORM
- CORS configuration

**Recommended Additions**:
- Rate limiting on API endpoints
- Input sanitization for XSS prevention
- HTTPS enforcement in production
- Security headers (CSP, HSTS)
- Regular dependency audits

## Accessibility

**Current Support**:
- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus indicators on interactive elements
- Sufficient color contrast ratios

**Future Improvements**:
- Screen reader testing
- High contrast mode support
- Reduced motion preferences
- Comprehensive ARIA labels

---

**Last Updated**: November 4, 2025
**Version**: 1.0.0
