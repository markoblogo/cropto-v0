# Інструкція з тестування (укр)

Паролі demo-акаунтів: `pass`
Акаунти: farmer@demo, trader@demo, broker@demo

## Перед тестом
1. Підключіться до Polygon Amoy (RPC в secrets).
2. Переконайтесь, що у профілі є wallet_address.
3. ENABLE_MINT=true і контракти в секретах для on-chain тестів.

## Тестування — фермер
1. Login → Create Option (CALL/PUT, strike, qty ≥ 500t) → перевірка OPEN.
2. Дочекатись match → FILLED.
3. Mint NFT → перевірити tokenId у рядку.
4. Exercise → перевірити settlement та PnL.

## Тестування — трейдер
1. Створити опціон для продажу, встановити премію і collateral.
2. Match із покупцем → перевірити зарахування премії.
3. Імітувати зміну індексу → margin call.
4. Top-up → перевірити reserved balance.
5. Невиконання margin call → forced settlement.

## Тестування — брокер / адмін
1. Match OPEN → FILLED.
2. Admin → reconciliation → експортувати CSV.
3. Admin → index override → перевірити перерахунок PnL.

## Скрипти
- `npm run seed:demo`
- `scripts/test_match.sh`
- `scripts/test_exercise.sh`
- `scripts/test_portfolio.sh`