# Cropto — what it is and why

**Cropto** is a simple, transparent tool to manage price risk in the agricultural market. We connect the physical grain market with digital instruments (NFTs and the CROPT token) so farmers can hedge prices and traders can earn additional income.

## Who is it for
- **Farmers** — lock in expected revenue by fixing a future delivery price.
- **Traders** — earn option premiums and profit from market movements.
- **Brokers / operators** — manage deals and maintain records tied to physical delivery.

## How it works (brief)
1. A physical deal (farmer ↔ trader) or an option listing is created.
2. The system issues an **NFT-option** (CALL/PUT) with strike, volume, term, premium.
3. Daily recalculation via the Spike Spot Commodity Index — PnL, margin calls, payouts.
4. Settlements happen off-chain first; optionally withdraw → mint on-chain (CROPT).
5. Admin panel: partners registry, transactions journal, reconciliation.

## Spot-forward model (what we actually run)
- Non-deliverable (cash-settled) forwards on grain indexes: Corn, Wheat 11.5, Feed Wheat, Soy GMO, Sunflower processing.
- Settlement in CROPT versus Spike Spot (CPT Odesa) using PnL = (SettlementPrice – ContractPrice) × Qty.
- Margin-based: initial margin + margin calls; overdue margin can be auto-liquidated.
- Legal form is an electronic agreement on the platform (not GAFTA-style physical delivery); disputes are handled off-chain.

## What the NFT-option contains
- Option id and link to the physical contract
- Type (CALL/PUT), strike, volume (tons), expiry
- Premium and settlement currency (CROPT / fiat)
- Execution / payout status

## Money flow (simplified)
- Premium goes to the seller (trader) or can act as a discount in the physical contract.
- Upon exercise — payout from collateral or CROPT balance.
- CROPT can be swapped to stablecoins / cashed out via usual channels.

## Why it's useful
- For farmers — a simpler hedging tool.
- For traders — additional income streams.
- For the market — a transparent ledger and an easy pilot path.
