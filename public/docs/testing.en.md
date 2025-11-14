# Testing Guide (EN)

Demo logins (password: `pass`):
- Farmer: `farmer@demo`
- Trader: `trader@demo`
- Broker: `broker@demo`

## A. Test as Farmer

1. Log in as `farmer@demo`.  
2. Create a new option (CALL or PUT) with small volume and visible strike.  
3. Check that it appears on the dashboard as **OPEN**.  
4. Ask the broker (or use `broker@demo`) to match it → status becomes **FILLED**.  
5. If testnet POL is available, click **Mint NFT** and verify the token on Polygon Amoy.

## B. Test as Trader

1. Log in as `trader@demo`.  
2. Find OPEN options and match one of them.  
3. Monitor margin status and PnL on the Portfolio page.  
4. Trigger an exercise scenario (via UI) and check that settlement and transactions are recorded.

## C. Test as Broker / Admin

1. Log in as `broker@demo`.  
2. Use the Admin screens to:
   - review deals and settlements  
   - export CSV  
   - override index prices (for demo purposes)  
3. Check that changes are reflected on the dashboard and in portfolio views.

This guide is for **demo only** and does not constitute investment advice.
