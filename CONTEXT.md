# Cropto Context

Cropto is indexed trading and settlement infrastructure for agricultural commodities inside the broader AMI ecosystem. This glossary keeps product, engineering and agent work aligned on the commodity workflow language used in the repository.

## Language

**AMI ecosystem**:
The broader agro-commodity market infrastructure stack that includes MN7R/Monitor, 1D3X, SPIKE/UGA Index and Cropto.
_Avoid_: standalone crypto app, generic exchange ecosystem

**Cropto**:
The trade, document and settlement layer for indexed agricultural commodity workflows inside AMI.
_Avoid_: crypto exchange, NFT marketplace, DeFi protocol

**MN7R / Monitor**:
The operational market-memory layer for brokerage workflows, BID/OFFER/TRADE activity, contracts, broker attribution and Telegram/reporting relay.
_Avoid_: generic dashboard, chat bot

**1D3X / SPIKE / UGA Index**:
Benchmark and reference-data infrastructure for local commodity prices, logistics context, basis signals and index governance.
_Avoid_: price oracle, crypto feed

**Indexed commodity workflow**:
A spot, forward, option-style or settlement workflow linked to local commodity indices and physical-market reference data.
_Avoid_: token trade, speculative trade

**Indexed trading layer**:
The Cropto layer for spot, forward and options-style workflows linked to local commodity indices.
_Avoid_: live exchange, execution venue

**Commodity ops assistant**:
An agent-assisted operator workflow for scanning market/data state, drafting BID/OFFER/TRADE records, previewing reports and preparing human-approved operator actions.
_Avoid_: trading bot, autonomous trader

**Market cockpit**:
A decision surface for monitoring commodity market signals, positions, exposures, reports, schedulers and operational workflows.
_Avoid_: consumer trading terminal

**BID**:
A structured buyer-side market interest record in the brokerage workflow.
_Avoid_: buy order, market order

**OFFER**:
A structured seller-side market interest record in the brokerage workflow.
_Avoid_: sell order, ask order

**TRADE**:
A structured matched or recorded physical-market workflow event in the monitor context.
_Avoid_: exchange fill, on-chain swap

**Market memory**:
The structured historical record of bids, offers, trades, contracts, broker attribution, reports and operational notes.
_Avoid_: event log, chat history

**Physical trade execution**:
The off-platform commercial execution of physical commodity transactions by brokers, counterparties or regulated partners.
_Avoid_: Cropto execution, on-chain trade

**Telegram relay**:
An operational publishing path for broker/auth/reporting workflows, gated by monitor-specific auth and preview/approval discipline.
_Avoid_: automated trading signal

**Document-bound record**:
A tokenized or database-backed record that represents a document, contract state or settlement event for auditability.
_Avoid_: collectible NFT, speculative NFT

**CROPT**:
The prototype internal demo accounting/settlement unit used in settlement, margin and testnet experiments.
_Avoid_: public token, investment asset

**Polygon Amoy**:
The Polygon testnet currently referenced for prototype on-chain document and settlement experiments.
_Avoid_: Polygon Mumbai, mainnet deployment

**Chain-optional trust layer**:
The use of public-chain, permissioned-ledger, private-ledger or non-crypto accounting rails depending on pilot scope, partner needs and regulation.
_Avoid_: blockchain-first architecture

**Operator action**:
A human-approved Cropto ops dispatch after preview, exact confirmation, idempotency and audit logging.
_Avoid_: autonomous execution, stonks mode
