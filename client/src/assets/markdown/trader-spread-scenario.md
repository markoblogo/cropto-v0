# Trader Spread: Calendar Spread on Corn

## Story
Anna is a commodity trader who believes corn prices will remain stable but expects seasonal patterns to create temporary price differences between delivery months. She wants to profit from the narrowing or widening of the price spread between near-term and deferred corn contracts.

## Strategy Overview
Anna implements a **calendar spread** strategy by buying and selling corn contracts in different time windows. This bet on the relationship between prices across time, not on the overall direction of corn prices.

## Step-by-Step Implementation

### 1. Analyze Market Data
Go to **Market Data** section to view corn price curves and spreads.

### 2. Select Strategy
Choose between two spread types:
- **Calendar Spread**: Same commodity, different windows (H1 vs H2)
- **Inter-Commodity Spread**: Different commodities, same window (Corn vs Feed Wheat)

### 3. Calendar Spread Setup
**Bull Calendar Spread** (betting on spread narrowing):
- **Buy**: Corn CPT Odesa **Aug H1** at $410/ton
- **Sell**: Corn CPT Odesa **Aug H2** at $405/ton
- **Net Debit**: $5/ton (H2 premium - H1 premium)
- **Quantity**: 500 tons each leg

**Bear Calendar Spread** (betting on spread widening):
- **Sell**: Corn CPT Odesa **Aug H1** at $410/ton
- **Buy**: Corn CPT Odesa **Aug H2** at $405/ton
- **Net Credit**: $5/ton received upfront

### 4. Alternative: Corn vs Feed Wheat Spread
**Cross-Commodity Spread**:
- **Buy**: Corn CPT Odesa **Sep H1** at $415/ton
- **Sell**: Feed Wheat CPT Odesa **Sep H1** at $380/ton
- **Net Debit**: $35/ton
- **Bet**: Corn will outperform feed wheat

### 5. Monitor and Manage
- Track positions in **Portfolio** section
- Monitor spread convergence in **Option Chain** views
- Use **Risk Dashboard** to track overall exposure

## PnL Scenarios

### Calendar Spread Examples

#### Bull Calendar (Spread Narrows)
**Entry**: H1 $410, H2 $405 (spread = $5)
- **Scenario 1**: Spread narrows to $2
  - H1 moves to $408, H2 moves to $406
  - **PnL**: +$2/ton profit on spread
- **Scenario 2**: Spread stays at $5
  - **PnL**: -$0 (breakeven)
- **Scenario 3**: Spread widens to $8
  - H1 moves to $412, H2 moves to $404
  - **PnL**: -$3/ton loss on spread

#### Bear Calendar (Spread Widens)
**Entry**: H1 $410, H2 $405 (spread = $5)
- **Scenario 1**: Spread widens to $8
  - H1 moves to $412, H2 moves to $404
  - **PnL**: +$3/ton profit on spread
- **Scenario 2**: Spread narrows to $2
  - **PnL**: -$3/ton loss on spread

### Cross-Commodity Spread Examples

#### Corn vs Feed Wheat
**Entry**: Corn $415, Feed Wheat $380 (spread = $35)
- **Corn outperforms** (moves to $425, Wheat to $375)
  - Spread widens to $50
  - **PnL**: +$15/ton profit
- **Wheat outperforms** (Corn $410, Wheat $390)
  - Spread narrows to $20
  - **PnL**: -$15/ton loss

## Risk Management
- **Volatility Risk**: Unexpected events can break spread relationships
- **Liquidity Risk**: Ensure sufficient volume in both legs
- **Time Decay**: Calendar spreads have defined lifespans
- **Margin Requirements**: Monitor collateral needs in **Portfolio**

## Key Takeaways
- Spreads profit from **relative price movements**, not absolute direction
- **Lower risk** than outright directional bets
- **Lower capital requirements** than individual positions
- Success depends on understanding **seasonal patterns** and **supply/demand dynamics**
- Monitor spreads using **Option Chain** and **Forward Market** data