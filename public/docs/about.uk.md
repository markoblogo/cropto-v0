# Про Cropto

Cropto — інфраструктура індексної торгівлі та розрахунків для аграрних commodities.

Прототип поєднує локальні commodity indices, контракти фізичного ринку та programmable settlement workflows. Він спроєктований для spot, forward і options-style workflow на аграрних commodities, використовуючи benchmark-дані 1D3X/SPIKE як reference infrastructure.

Cropto не є generic crypto exchange, NFT marketplace або DeFi product. Blockchain layer використовується тільки там, де він дає infrastructure value: verification документів, contract-state records, settlement traceability і optional programmable clearing.

## Як працює прототип

- Market data і benchmark indices визначають reference prices.
- Користувачі можуть переглядати commodity markets, options, spot і forward-style workflows.
- Contract and option states записуються у structured database tables.
- Settlement and margin events відстежуються за index references.
- CROPT використовується як demo accounting and settlement unit.
- Polygon Amoy testnet може використовуватися для document-bound verification records і transaction traces.

## Поточний статус

Cropto залишається функціональним прототипом. Standalone development наразі paused, поки AMI ecosystem розширюється через MN7R, 1D3X і SPIKE. Це не live financial trading venue.
