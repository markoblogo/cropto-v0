# Testing Guide — Cropto (compact)

Updated testing instructions for the Cropto demo. Use the demo accounts below to run through the flows.

## Demo accounts

- **Farmer**: farmer@demo / pass
- **Trader**: trader@demo / pass
- **Broker**: broker@demo / pass

## Conventions & units

- **Strike:** price in USD per tonne ($/t).
- **Quantity:** tonnes (minimum lot **500**).
- **Premium:** premium_per_t ($/t). Total premium = premium_per_t * qty.
- **Network:** Polygon Amoy (currency: POL).

## Quick scenario: Create → Match → Mint (recommended)

### 1) Create option (farmer)

1. Login as `farmer@demo`.
2. Dashboard → Create Option.
3. Example fields:
   - Commodity: `wheat`
   - Type: `CALL`
   - Strike: `210` ($/t)
   - Quantity: `500` (t)
   - Premium per t: `5` ($/t)
4. Submit → option status should be `OPEN`.

### 2) Match option (broker)

1. Logout → Login as `broker@demo`.
2. Find the created option → press _Match_ and assign counterparty.
3. Status should change to `FILLED`.

### 3) Mint NFT (owner)

Prerequisite: FILLED option and sufficient POL in wallet (≈0.02–0.03 POL per mint) OR mock mode enabled.

To mint:
- If backend relayer (dev-mint): call the API `POST /api/onchain/mint-nft` with auth token (curl example below).
- If user mint via MetaMask: click _Mint NFT_ in UI and approve the transaction in MetaMask.

## Admin: Manual settlement (daily)

```bash
curl -s -X POST https://<BASE_URL>/api/jobs/daily-settle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -d '{"date":"2025-11-08","commodity":"wheat","indexPrice":230}'
```

Response includes per-option settlements, PnL and actions taken (margin calls, forced settlements).

## Useful curl commands

### Mint NFT (backend relayer)

```bash
curl -s -X POST https://<BASE_URL>/api/onchain/mint-nft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"optionId":"<OPTION_ID>","recipient":"0xAbCd..."}'
```

### Check CROPT balance

```bash
curl -s https://<BASE_URL>/api/onchain/balance/0xYourAddress
```

## MOCK / Safe testing mode

To avoid spending POL during early tests, set environment vars:
- `VITE_MOCK_ONCHAIN=true` — client shows banner and on-chain flows are simulated;
- or `VITE_ENABLE_MINT=false` — backend blocks real minting and returns simulated TXs.

## Troubleshooting (common)

- **Mint fails:** check POL balance, faucet, or enable mock mode.
- **Invalid address:** use checksummed address from MetaMask (ethers.getAddress validation).
- **401 Unauthorized:** log in and use returned JWT for curl commands.
- **Validation errors:** ensure qty >= 500 and numeric strike.

## Where to find contract addresses / env

- `CROPT_CONTRACT_ADDRESS` — CROPT token (env / Replit secrets)
- `CROPT_NFT_CONTRACT_ADDRESS` — Option NFT contract
- Explorer: `https://amoy.polygonscan.com`

## Expected status flow

`OPEN → SELECTED → FILLED → EXERCISED → SETTLED`

Margin states: `OK → MARGIN_CALL → DEFAULTED` (forced settlement after 24h timeout)

---

If you want this page translated to Ukrainian or Russian, or need additional help, let me know.
