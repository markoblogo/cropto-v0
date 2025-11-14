# Testing Guide (EN)

Demo accounts: farmer@demo, trader@demo, broker@demo
Password: `pass`

## Before you start
1. Connect MetaMask to Polygon Amoy (RPC in secrets).
2. Ensure wallet_address in your profile.
3. ENABLE_MINT=true and contracts set in secrets for on-chain tests.

## Farmer tests
1. Login → Create Option (CALL/PUT, strike, qty ≥ 500t) → check OPEN status.
2. Wait for match → becomes FILLED.
3. Mint NFT → check tokenId on option row.
4. Exercise → verify settlement and PnL.

## Trader tests
1. Create sell option with premium and collateral.
2. Match with buyer → premium credited.
3. Simulate index move → margin call.
4. Top-up collateral → verify reserved balance.
5. Miss margin call → forced settlement.

## Broker / Admin tests
1. Match OPEN → FILLED.
2. Admin → reconciliation → export CSV.
3. Admin → index override → verify PnL recalculation.

## Scripts
- `npm run seed:demo`
- `scripts/test_match.sh`
- `scripts/test_exercise.sh`
- `scripts/test_portfolio.sh`