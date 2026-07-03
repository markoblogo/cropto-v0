# AMI Integration

Cropto is designed to become the indexed trading, document-verification and settlement layer of the AMI ecosystem.

## Ecosystem Roles

### MN7R / Monitor

MN7R / Monitor captures brokerage workflows:

- BID/OFFER/TRADE creation and updates;
- contract and counterparty context;
- broker attribution;
- market memory;
- operational relay into Telegram and reporting channels.

This layer observes and structures physical-market activity.

### 1D3X / SPIKE / UGA Index

1D3X, SPIKE and UGA Index provide benchmark infrastructure:

- local commodity price indices;
- logistics and basis context;
- physical-market reference data;
- index governance and publication direction.

This layer produces the reference prices and market signals needed for indexed instruments.

### Cropto

Cropto consumes those indices as reference infrastructure for:

- indexed spot workflows;
- options-style risk workflows;
- forward/settlement simulations;
- document verification;
- contract-state records;
- settlement traceability;
- optional programmable clearing.

Cropto does not need to be locked to one chain architecture. The final pilot can use public-chain, permissioned-ledger, private-ledger or non-crypto accounting rails depending on regulation and partner requirements.

### Future Regulated Partners

Future partners may provide:

- clearing;
- custody;
- payment rails;
- compliant participant onboarding;
- risk instruments;
- reporting and audit support.

## Target Architecture Logic

```text
Physical brokerage activity
        ↓
MN7R / Monitor market memory
        ↓
1D3X / SPIKE / UGA benchmark indices
        ↓
Cropto indexed workflows + document records + settlement traceability
        ↓
Regulated partner rails for clearing, custody, payments and risk instruments
```

## Why Cropto Exists in AMI

Physical agricultural commodity markets often need better links between local market reality, risk management and settlement infrastructure. Cropto's role is to turn benchmark-index references, documents and contract states into traceable digital workflows that can support partner-backed pilots.

The core product is not a public token. The core product is a verified commodity-market obligation, index exposure, contract state or settlement record.
