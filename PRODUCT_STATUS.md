# Cropto Product Status

Cropto is a functional prototype for indexed agricultural commodity workflows, document verification and settlement traceability. It is not currently operating as a live financial trading venue.

## Summary

- Standalone Cropto development is paused while the broader AMI ecosystem expands through MN7R, 1D3X, SPIKE/UGA Index and related products.
- The codebase remains functional and contains implemented modules for market workflows, spot/options/forward prototypes, document-bound token records and tokenized settlement experiments.
- The architecture is partner-pilot ready with additional work: index integration, compliance design, product hardening and regulated rails.

## Functional Prototype Modules

- Public Cropto web app with homepage, market dashboard, portfolio, wallet, options, spot, forward and education routes.
- Indexed commodity workflow schema: indices, options, trades, settlements, forwards, margin calls and transactions.
- Options lifecycle: create, match, exercise, force-settle, margin monitor and settlement records.
- Spot/forward workflow modules with order, contract and settlement structures.
- Sea Brokerage Monitor for BID/OFFER/TRADE workflows, matching views, archive/tape/analytics and broker attribution.
- Telegram monitor auth, publishing and scheduled report paths.
- Google Sheets dictionary/record import and sync scripts.
- Partner/investor deck route at `/deck`.

## Experimental Modules

- CROPT ERC-20 prototype accounting/settlement token.
- CroptOptionNFT ERC-721 prototype for document-bound option records.
- Polygon Amoy on-chain routes for balance, mint, document-record minting and transaction tracking.
- On-chain transaction poller/monitoring paths.
- Demo wallet and minting flows.
- Index-linked forward spreads and risk analytics surfaces.

## Paused Standalone Work

- Public standalone Cropto product expansion.
- Production-grade indexed trading venue design.
- Final settlement-unit architecture.
- Final ledger architecture and chain selection.
- Live partner-clearing/custody/payment integration.

## Not Currently Live

Cropto is not currently:

- a regulated exchange;
- a public crypto exchange;
- an NFT marketplace;
- a live DeFi protocol;
- a venue for legally binding public commodity trading.

Displayed trades, balances, settlements and on-chain actions should be treated as prototype, demo, staging or feature-specific test flows unless a deployment owner confirms otherwise.

## Revival Conditions

A partner-backed revival should define:

- target market and commodity scope;
- reference indices from 1D3X/SPIKE/UGA Index;
- legal and regulatory perimeter;
- clearing, custody and payment partners;
- whether settlement runs on public chain, permissioned ledger, private ledger or non-crypto internal accounting;
- pilot success metrics;
- security, audit and data-retention requirements;
- production support and incident process.

## Hardening Status

The current codebase includes a baseline hardening pass for prototype and partner-pilot readiness:

- public registration cannot assign broker/admin/super-admin roles;
- self-service role updates cannot assign operator roles;
- production job endpoints require `JOB_RUNNER_SECRET`;
- API/auth/upload rate limits are enabled in the web process;
- feedback uploads are restricted to image MIME types, size-capped and served with static hardening headers;
- wallet lookup by user id is no longer public;
- duplicate spot-route registration was removed from server startup.

Residual dependency audit items remain. `npm audit --omit=dev` still reports issues that require breaking upgrades or package replacement, mainly `drizzle-orm`, `nodemailer`, Hardhat-related transitive packages and `xlsx` with no upstream fix. These should be handled as explicit migration tasks with regression testing.
