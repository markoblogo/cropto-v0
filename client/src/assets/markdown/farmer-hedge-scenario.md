# Farmer Hedge: Protecting Corn Harvest

## Story
John is a Ukrainian farmer with 1000 tons of corn ready for harvest in August. The current corn price is $400/ton, but he's concerned about potential price drops due to weather risks or market volatility. He wants to secure a minimum price for his crop while keeping upside potential.

## Strategy Overview
John can use **put options** or **forward contracts** to protect his harvest price. This gives him downside protection while allowing participation in price increases.

## Step-by-Step Implementation

### 1. Navigate to Options Trading
Go to **Spot Trading → Options** section in Cropto platform.

### 2. Select Corn Index
Choose **Corn CPT Odesa** commodity index - this tracks corn prices at the key Odessa export port.

### 3. Choose Time Window
Select **Aug 2H** (August second half) window to match John's harvest timing.

### 4. Buy Put Options
- **Type**: PUT option
- **Strike**: $380/ton (20% downside protection)
- **Quantity**: 1000 tons (full hedge)
- **Premium**: ~$15-20/ton (depends on volatility)

### 5. Alternative: Forward Contract
Instead of options, John could sell a forward contract:
- Go to **Forward Market** section
- Sell 1000 tons of **Corn CPT Odesa Aug 2H**
- Fixed price: $385/ton
- Locks in price completely but eliminates upside

## PnL Scenarios

### Scenario 1: Price drops to $350/ton
- **Put Option**: John exercises at $380, receives $30/ton protection
- **Net**: ($380 - $350) - premium = $30 - $17 = **+$13/ton profit**
- **Forward**: Fixed at $385, receives $35/ton regardless of market

### Scenario 2: Price stays at $400/ton
- **Put Option**: Option expires worthless, John sells at market price
- **Net**: $400 - premium = $400 - $17 = **+$383/ton**
- **Forward**: Receives $385/ton (slightly less than market)

### Scenario 3: Price rises to $450/ton
- **Put Option**: John sells at higher market price, option expires worthless
- **Net**: $450 - premium = **+$433/ton** (full upside participation)
- **Forward**: Limited to $385/ton (misses upside opportunity)

## Risk Management
- Monitor positions in **Portfolio** section
- Set price alerts in **Market Data** dashboard
- Track margin requirements (options require collateral)

## Key Takeaways
- Put options provide **asymmetric protection**: limited downside risk, unlimited upside
- Forward contracts provide **complete certainty** but eliminate upside potential
- Cost of protection depends on market volatility and time to expiration
- Always consider basis risk between local harvest prices and index prices