# Cropto — What It Is

Cropto is indexed trading and settlement infrastructure for agricultural commodities.

It is designed as the trade, document and settlement layer of the AMI ecosystem: local benchmark indices from 1D3X/SPIKE provide reference prices, while Cropto models spot, forward and options-style workflows around those references.

Cropto is not a generic crypto exchange or NFT marketplace. Tokenization is used as infrastructure for document verification, contract-state records, settlement traceability and optional programmable clearing.

## Who It Is For

- **Producers and commercial participants** — manage price risk against local benchmark indices.
- **Traders and risk participants** — express indexed exposure without interfering with physical logistics.
- **Brokers and operators** — record market workflows, contracts, counterparty context and settlement events.
- **Infrastructure partners** — evaluate indexed pilot workflows, clearing, custody, payment rails and compliance architecture.

## How It Works

1. A market workflow, contract or option-like record is created.
2. The record is tied to a commodity, benchmark index, quantity, strike/window and counterparties.
3. The system tracks state changes, margin, P&L and settlement events.
4. CROPT is used as a demo accounting and settlement unit in the prototype.
5. Optionally, document-bound verification records can be created on Polygon Amoy testnet.

## What Document-Bound Records Contain

- Option or contract id.
- Type, strike, quantity, expiry/window and commodity reference.
- Link to contract metadata.
- Settlement/accounting status.
- Testnet transaction and record id when an on-chain proof is created.

These records are not designed as speculative collectible NFTs. They are audit and verification records for prototype workflows.

## Current Status

Cropto is a functional prototype. Standalone development is currently paused while AMI expands through MN7R, 1D3X and SPIKE. The codebase remains useful for partner-backed pilots, architecture review and indexed settlement demonstrations.
