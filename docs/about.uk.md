# Cropto — що це

Cropto — інфраструктура індексної торгівлі та розрахунків для аграрних commodities.

Платформа задумана як торговий, документальний і розрахунковий шар AMI ecosystem: локальні benchmark-індекси 1D3X/SPIKE дають референсні ціни, а Cropto моделює spot, forward та options-style workflow навколо цих референсів.

Cropto не є generic crypto exchange або NFT marketplace. Tokenization використовується як інфраструктура для верифікації документів, записів стану контрактів, трасованості розрахунків і опційного programmable clearing.

## Для кого

- **Виробники та комерційні учасники** — керування ціновим ризиком за локальними benchmark-індексами.
- **Трейдери та risk participants** — індексна експозиція без втручання у фізичну логістику.
- **Брокери та оператори** — запис market workflow, контрактів, контексту контрагентів і settlement events.
- **Інфраструктурні партнери** — оцінка pilot workflow, clearing, custody, payment rails і compliance architecture.

## Як це працює

1. Створюється market workflow, contract або option-like record.
2. Запис прив’язується до commodity, benchmark index, quantity, strike/window і counterparties.
3. Система відстежує state changes, margin, P&L і settlement events.
4. CROPT використовується як demo accounting and settlement unit.
5. Опційно document-bound verification records створюються у Polygon Amoy testnet.

Ці записи не призначені як speculative collectible NFTs. Це audit і verification records для prototype workflow.

## Поточний статус

Cropto — функціональний прототип. Standalone development наразі paused, поки AMI розвивається через MN7R, 1D3X і SPIKE. Кодова база залишається корисною для partner-backed pilots, architecture review та indexed settlement demonstrations.
