# FAQ — Cropto

### Що таке Cropto?

Cropto — функціональний прототип для індексованих аграрних commodity workflow, верифікації документів і трасованості розрахунків.

### Cropto є live trading venue?

Ні. Cropto зараз не працює як live financial trading venue, public crypto exchange, NFT marketplace або DeFi product.

### Що таке document-bound verification record?

Це ERC-721 testnet record, який зберігає metadata опціону або контракту для auditability. Він може представляти документ, contract state або settlement event. Це не collectible або speculative NFT asset.

### Як працює settlement / exercise у прототипі?

Система розраховує intrinsic value за обраним commodity index, порівнює його з strike/collateral rules і записує payout, margin або forced-settlement events у database. On-chain proof може додаватися для окремих flow у Polygon Amoy testnet.

### Що таке CROPT?

CROPT — demo accounting and settlement unit у прототипі. Він реалізований як ERC-20 testnet contract для experiments, але фінальна архітектура може використовувати public-chain, permissioned-ledger, private-ledger або non-crypto accounting rails.

### Чи можна торгувати document records?

Product direction не є speculative record trading. Document-bound records призначені для verification, state tracking і settlement traceability. Будь-яка transferability у pilot має відповідати legal і partner requirements.
