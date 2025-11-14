# About Cropto

Cropto is an experimental platform for **hedging grain price risk** and trading **NFT options** that are linked to real physical grain prices via the **Spike Spot Commodity Index**.

## Who is it for?

- **Farmers** — lock in the selling price for future harvest, reduce downside risk.
- **Traders** — sell options, earn premiums, manage collateral and margin calls.
- **Brokers / partners** — onboard clients, reconcile deals, monitor risk.

## How it works (Pre-MVP)

1. Parties agree a **physical deal** off-chain (farmer ↔ trader or trader ↔ trader).
2. On Cropto, they create an **option**:
   - type: CALL / PUT  
   - strike price  
   - volume (tons)  
   - expiry date  
   - premium  
   - collateral (margin)
3. The option can be **matched** on the platform (our matching engine) and becomes FILLED.
4. Once FILLED, the option can be **minted as an NFT (ERC-721)** on Polygon Amoy:
   - metadata includes optionId, type, strike, volume, expiry, parties and link to the contract.
5. Every day the option is **repriced** using the Spike Spot Commodity Index:
   - PnL, margin calls and potential forced settlement are calculated off-chain.
6. At expiry or early exercise, the platform creates a **settlement** record and off-chain payout in fiat or CROPT.

## What is stored in the NFT?

The NFT is a **proof of right** to settlement under a specific option. Metadata contains:

- `optionId` — internal identifier in Cropto DB
- option type (CALL / PUT)
- strike price
- volume (tons)
- expiry date
- buyer / seller roles
- reference to the physical contract or broker deal

## Current status

- We use **Polygon Amoy** testnet and a test CROPT token.
- All flows are **demo-only**, with limited real counterparties.
- The goal of this Pre-MVP is to validate UX, risk logic and data model before scaling.
