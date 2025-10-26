# Cropto - Crypto Options Trading Platform Design Guidelines

## Design Approach: Financial Trading System

**Selected Approach:** Hybrid system drawing from established trading platforms (Robinhood, Coinbase, Binance) with Material Design principles for data-rich interfaces.

**Core Principle:** Financial applications demand clarity, trust, and efficiency. Every design decision prioritizes data legibility, quick scanning, and confident action-taking.

## Typography System

**Font Families:**
- Primary: Inter (via Google Fonts) - body text, data, forms
- Accent: JetBrains Mono (via Google Fonts) - numerical values, prices, quantities

**Hierarchy:**
- H1: text-4xl md:text-5xl font-bold (page titles)
- H2: text-3xl font-semibold (section headers)
- H3: text-xl font-semibold (card titles, table headers)
- Body: text-base (standard content)
- Data Labels: text-sm font-medium uppercase tracking-wide (field labels)
- Numerical Values: text-lg md:text-xl font-mono font-semibold (prices, quantities)
- Small/Meta: text-xs (timestamps, secondary info)

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, and 8 consistently
- Micro spacing: space-2, p-2, gap-2
- Standard spacing: space-4, p-4, gap-4, m-4
- Section spacing: space-6, py-6, px-6
- Major spacing: space-8, py-8, px-8

**Container Strategy:**
- Max-width: max-w-7xl for main content
- Full-bleed sections for data tables and charts
- Sidebar layouts: Fixed 64-unit sidebar (w-64) with fluid main content

## Core Layout Structure

### Navigation
**Top Navigation Bar:**
- Fixed position (sticky top-0)
- Height: h-16
- Logo left-aligned with brand name
- Primary navigation center (Dashboard, Options, Positions, Analytics)
- User profile and wallet connection right-aligned
- Border bottom for separation

### Dashboard Layout
**Three-Column Grid:**
```
[Account Summary Card] [Quick Actions] [Recent Activity]
      (col-span-4)        (col-span-4)      (col-span-4)
```
- Use grid-cols-12 for flexible layouts
- Card-based design with consistent padding (p-6)
- Elevated cards with subtle shadows

### Options Trading Interface

**Split Layout:**
- Left Panel (w-2/5): Order entry form
- Right Panel (w-3/5): Order book and market data

**Order Entry Form Structure:**
- Section grouping with border separators
- Field spacing: space-y-4
- Label above input pattern
- Inline validation messaging
- Large, prominent action button (h-12 w-full)

### Options Listing/Table View

**Data Table Design:**
- Full-width responsive table
- Sticky header row
- Row height: h-16 for comfortable scanning
- Cell padding: px-6 py-4
- Alternating row treatment for readability
- Right-aligned numerical columns
- Status badges (inline-flex items-center px-3 py-1 rounded-full text-sm)

**Table Columns:**
1. Option Title/Symbol (left-aligned, font-semibold)
2. Type Badge (CALL/PUT)
3. Strike Price (right-aligned, font-mono)
4. Quantity (right-aligned, font-mono)
5. Premium (right-aligned, font-mono)
6. Status (badge component)
7. Actions (icon buttons, right-aligned)

## Component Library

### Cards
- Base: rounded-lg border shadow-sm
- Padding: p-6
- Header: mb-4 with title (text-xl font-semibold)
- Content area with consistent spacing

### Buttons
**Primary Action:**
- Rounded: rounded-lg
- Padding: px-6 py-3
- Font: text-base font-semibold
- Full-width on mobile: w-full md:w-auto

**Secondary/Outline:**
- Border: border-2
- Padding: px-5 py-2.5 (slightly smaller)
- Font: text-sm font-medium

**Icon Buttons:**
- Square: w-10 h-10
- Rounded: rounded-lg
- Flex center: flex items-center justify-center

### Form Inputs
**Text/Number Inputs:**
- Height: h-12
- Padding: px-4
- Border: border-2
- Rounded: rounded-lg
- Font: text-base
- Numerical inputs: font-mono for prices/quantities

**Labels:**
- Margin: mb-2
- Font: text-sm font-medium
- Always include for accessibility

**Select Dropdowns:**
- Consistent with text inputs (h-12, px-4)
- Icon indication for dropdown state

### Status Badges
- Rounded-full for pill shape
- Padding: px-3 py-1
- Font: text-xs font-semibold uppercase tracking-wider
- Inline-flex with dot indicator

### Data Cards (Metrics)
**Structure:**
- Label: text-sm font-medium mb-1
- Value: text-3xl font-bold font-mono mb-1
- Change indicator: text-sm with up/down arrow
- Compact padding: p-4

## Trading-Specific Components

### Order Book Display
**Two-Column Layout:**
- Bids (left) | Asks (right)
- Each row: Price | Quantity | Total
- Font: font-mono for all values
- Row height: h-8 for dense information
- Highlight best bid/ask

### Option Chain Grid
**Responsive Grid:**
- Strikes in center column
- Calls on left, Puts on right
- Mobile: Stack vertically
- Desktop: grid-cols-3
- Cells: p-3 text-center

### Position Cards
**Horizontal Layout:**
- Flex container: flex items-center justify-between
- Left: Option details (title, strike, type)
- Center: P&L display (large, font-mono)
- Right: Action buttons (Close, Adjust)
- Border-left accent for position type

## Responsive Behavior

**Breakpoints:**
- Mobile: Base (< 768px) - Single column, stacked components
- Tablet: md (768px+) - Two columns where appropriate
- Desktop: lg (1024px+) - Full multi-column layouts
- Wide: xl (1280px+) - Maximum content width with side padding

**Mobile Adaptations:**
- Bottom sheet modals for forms
- Hamburger menu for navigation
- Simplified table views (card-based on mobile)
- Sticky CTAs at bottom of viewport

## Icon System

**Library:** Heroicons (via CDN)
- Navigation: outline style (w-6 h-6)
- Inline actions: solid style (w-5 h-5)
- Status indicators: w-4 h-4

**Key Icons:**
- Chart: for analytics/positions
- Plus/Minus: for buy/sell actions
- ArrowTrendingUp: for calls
- ArrowTrendingDown: for puts
- Bell: for notifications
- User: for account

## Accessibility Standards

**Focus States:**
- Visible focus rings on all interactive elements
- Focus-visible: ring-2 ring-offset-2

**ARIA Labels:**
- All icon-only buttons have aria-label
- Form inputs have associated labels (not just placeholders)
- Table headers properly scoped

**Keyboard Navigation:**
- Logical tab order throughout trading interfaces
- Enter key submits forms
- Escape closes modals

## Animation Guidelines

**Minimal Use - Clarity First:**
- Page transitions: None (instant for trading speed)
- Modal entry/exit: Simple fade (200ms)
- Button feedback: Subtle scale on click (transform scale-95)
- NO scroll animations
- NO complex trading animations that distract

**Loading States:**
- Skeleton screens for data tables (animate-pulse)
- Spinner for form submissions (w-5 h-5 animate-spin)

## Images

**No hero images for this trading application.** Financial platforms prioritize immediate access to data and tools over visual marketing.

**Icon/Logo Usage Only:**
- Company logo in navigation (h-8)
- Cryptocurrency icons next to symbols (w-6 h-6)
- Empty state illustrations for no positions/orders

This design creates a professional, trustworthy trading environment where users can confidently execute crypto options trades with clarity and precision.