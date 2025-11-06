# Cropto Pilot Onboarding Guide

Welcome to the Cropto pilot program! This guide will walk you through getting started with the platform and obtaining test CROPT tokens.

## Overview

Cropto is a cryptocurrency options trading platform that allows you to:
- Create and trade crypto options (calls and puts)
- Exercise options and settle positions
- Track your portfolio and P&L
- Receive automated margin calls
- Use CROPT tokens for collateral

## Getting Started

### 1. Create Your Account

1. Navigate to the Cropto platform at your deployed URL
2. Click "Register" and create an account
3. Choose your role:
   - **Trader**: Buy and sell options
   - **Farmer**: Create options for agricultural commodities (e.g., wheat)
   - **Broker**: Access admin features (by invitation only)

### 2. Connect Your Wallet

To use CROPT tokens, you'll need to connect a Web3 wallet:

1. Install MetaMask browser extension if you haven't already
2. Log in to Cropto
3. Click "Connect Wallet" in the header
4. Choose one of the options:
   - **MetaMask**: Connect your MetaMask wallet automatically
   - **Manual Input**: Enter your wallet address manually

**Important**: Make sure your wallet is connected to the Polygon Mumbai testnet.

#### Setting up Polygon Mumbai Testnet

1. Open MetaMask
2. Click the network dropdown (top center)
3. Click "Add Network" → "Add a network manually"
4. Enter the following details:
   - **Network Name**: Polygon Mumbai Testnet
   - **RPC URL**: https://rpc-mumbai.maticvigil.com/
   - **Chain ID**: 80001
   - **Currency Symbol**: MATIC
   - **Block Explorer**: https://mumbai.polygonscan.com/

### 3. Get Test CROPT Tokens

There are two ways to obtain test CROPT tokens:

#### Option A: Mint via Platform (Recommended)

1. Log in to Cropto with your wallet connected
2. Click on your wallet address in the header
3. Click "Withdraw CROPT" button
4. Enter the amount of CROPT tokens you want (e.g., 1000)
5. Click "Mint to Wallet"
6. Wait for the transaction to be confirmed (usually 10-30 seconds)
7. Your CROPT balance will update automatically

**Note**: The platform uses a backend signing service, so you won't need to pay gas fees or confirm transactions in MetaMask.

#### Option B: Request from Admin

If you encounter issues with automatic minting:

1. Contact the Cropto admin team
2. Provide your wallet address
3. An admin will mint test CROPT tokens directly to your wallet

### 4. Fund Your Account

Once you have CROPT tokens in your wallet, you can:

1. Navigate to the Dashboard
2. View your CROPT balance in the header
3. Use CROPT tokens as collateral when creating options
4. Top up margin calls using CROPT

## Using the Platform

### Creating Options

1. Go to Dashboard
2. Click "Create Option"
3. Fill in the details:
   - **Type**: CALL or PUT
   - **Strike Price**: The price at which the option can be exercised
   - **Premium**: The price you're asking for the option
   - **Expiry Date**: When the option expires
   - **Commodity**: The underlying asset (e.g., WHEAT, BTC)
   - **Collateral**: Amount to lock as security
   - **Currency**: CROPT or FIAT

4. Click "Create Option"

### Trading Options

1. Browse available options on the Dashboard
2. Filter by:
   - Status (OPEN, FILLED, EXPIRED, etc.)
   - Type (CALL/PUT)
   - Commodity

3. Click "Match" on an option to buy it
4. Confirm the transaction

### Managing Your Portfolio

1. Navigate to "Portfolio" in the header
2. View your metrics:
   - Total P&L (Profit & Loss)
   - Open Positions
   - Locked Collateral
   - Margin Calls

3. See all your positions with individual P&L calculations

### Handling Margin Calls

If an option's value moves against you significantly:

1. You'll receive a notification
2. Navigate to the Dashboard
3. Find options with "MARGIN_CALL" status
4. Click "Top Up" to add more collateral
5. Choose currency (CROPT or FIAT)
6. Enter the amount
7. Submit to restore your position

**Important**: Margin calls must be addressed within 24 hours or your position will be liquidated.

## Test Environment Details

### Network Information

- **Network**: Polygon Mumbai Testnet
- **Chain ID**: 80001
- **CROPT Contract**: [Address will be displayed in your environment]

### Rate Limits

The platform has the following limits for the pilot:
- Minting: Up to 10,000 CROPT per transaction
- Options: No limit on number of options
- Margin calls: 24-hour response window

### Getting Help

If you encounter any issues:

1. Use the Feedback form (accessible via header navigation)
2. Contact the admin team
3. Check the Docs page for detailed information

## Security Reminders

- Never share your private keys or seed phrase
- Use test tokens only (no real value)
- The Mumbai testnet is for testing purposes only
- All transactions are visible on the Mumbai block explorer

## Next Steps

1. ✅ Create your account
2. ✅ Connect your wallet to Mumbai testnet
3. ✅ Mint test CROPT tokens
4. ✅ Create your first option
5. ✅ Explore the platform features

Welcome aboard, and happy trading!

---

*For technical support or questions, please use the Feedback form or contact the admin team.*
