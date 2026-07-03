# FAQ — Cropto

### Що таке Cropto?

Cropto — прототип для індексованих аграрних commodity workflows, верифікації документів і трасованості розрахунків.

### Cropto — це live trading?

Ні. Cropto — demo/prototype environment, а не regulated exchange або live trading venue.

### Що таке document-bound verification record?

Це testnet ERC-721 record, який зберігає metadata опціону або контракту для auditability. Він використовується для verification документів, contract states або settlement events. Це не speculative NFT collectible.

### Як розраховується P&L?

Прототип порівнює selected index price з умовами contract або option, а потім записує P&L, margin і settlement events.

### Що відбувається при margin call?

Якщо збитки наближаються до collateral limit, позиція може отримати margin top-up flag. Якщо margin call не вирішено, прототип може записати forced settlement.

### Як отримати CROPT для тестів?

CROPT — demo accounting and settlement unit. В on-chain tests він існує у Polygon Amoy testnet, а test balances mint через controlled backend endpoints.
