# CASCADELOG — Cropto

## Ціль (критерії успіху)
- Запустити робочий Pre-MVP Cropto для пілота з 2–3 партнерами:
  - фермери та трейдери можуть створювати, матчити і виконувати опціони на зерно;
  - є базова логіка margin call, settlement і PnL;
  - є інтеграція з індексом Spike (через Telegram або ручне введення);
  - є мінімальний on-chain шар: CROPT (ERC-20) + NFT опціонів (ERC-721) на Polygon Amoy для демонстрації;
  - продукт доступний на публічному домені, з демо-акаунтами та інструкцією з тестування (EN/UK).

## Обмеження / допущення
- 1 розробник + AI-асистенти; робимо все поетапно, без перефакторування «все й одразу».
- Інфраструктура зараз: GitHub (код) + Runway/host (деплой бек/фронт) + Supabase (Postgres) + Polygon Amoy (тестнет).
- Це пилотна версія, не фінальний фінансовий продукт: юридика / ліцензії вирішуються окремо.

## Правила ведення логу
- **Оновлювати після кожного завершеного завдання** (feature/improvement рівня)
- **НЕ фіксувати:** дрібні багфікси, рефакторинг без змін функціональності, типові технічні задачі
- **Фіксувати:** нові фічі, значні покращення UX/UI, важливі інтеграції, milestones
- Формат: короткий опис що зроблено, ключові зміни, статус (завершено/в процесі)

## Ключові рішення (high-level)
- Модель:
  - NFT-опціони на зерно (CALL/PUT), прив’язані до Spike Spot Commodity Index.
  - Фермер купує опціон (хеджує ціну), трейдер продає і вносить колатерал.
  - Margin call при ~80% використання маржі, forced settlement при невиконанні.
  - Розрахунки спочатку off-chain (фіат / внутрішній баланс), on-chain CROPT — як «вітрина» та можливість виводу.
- Ролі:
  - farmer, trader, broker (Spike Brokers) + admin.
- Дані:
  - Основна БД — Supabase (таблиці users, options, margin_calls, settlements, transactions, indexPrices, notifications, feedback, onchain_tx тощо).
- On-chain:
  - CROPT ERC-20 на Polygon Amoy.
  - CroptOptionNFT ERC-721 на Polygon Amoy; mint NFT для FILLED/EXERCISED опціонів з збереженням tokenId та txHash.
- Індекс:
  - Джерело — Telegram-канал @spike_brokers, парсер для повідомлень з цінами (наприклад "Пшениця 11.5pro – 221$ (0$)").
- UI / UX:
  - React + Vite, локалізація EN/UK через react-i18next.
  - Основні сторінки: Dashboard, Portfolio, Admin, About, Testing.

## Статус

### Зроблено (узагальнено)
- Реалізовані: auth, створення опціонів, matching engine, exercise & settlement, PnL-дашборд, базова margin-call логіка.
- On-chain: CROPT ERC-20 + NFT-контракт опціонів на Polygon Amoy, API для mint та відслідковування tx-статусів.
- Індекс: модель indexPrices + API + парсер Telegram-повідомлень (джерело Spike).
- Фронтенд: робочий Dashboard, Portfolio, Admin-панель, About + Testing, перемикач мов EN/UK.
- Market Dashboard API: реалізовано `/api/market-dashboard` для UA/BR/AR індексів, admin endpoints для управління індексами, history endpoint для графіків.
- E2E Smoke Test: створено скрипт `scripts/e2e_smoke.ts` для перевірки основних флоу (health, login, create/match/exercise option, portfolio verification).

### Зараз
- Проведено аналіз PDF-специфікації головної сторінки та поточного стану коду.
- Визначено відмінності між специфікацією та реалізацією:
  - Hero-секція: потрібно оновити тексти заголовка/підзаголовка та перевірити відповідність CTA-кнопок.
  - Market Dashboard: є базова реалізація з вкладками UA/BR/AR, але потрібно додати описи джерел цін та структурувати карточки індексів за специфікацією.
  - How Cropto Works: компонент існує, потрібно перевірити відповідність кроків специфікації.
  - Footer: потрібна переробка структури навігації згідно специфікації.
  - Навігація: потрібно перевірити структуру Header та додати відповідні маршрути.
- Складено roadmap з 8 кроків для реалізації нового homepage за PDF-специфікацією.

### Далі (high-level план)
- ✅ **Шаг 1**: Навігація та роутинг — завершено:
  - Footer перероблено згідно специфікації (Index Trading, Options Trading, Market Data, Documentation, Wallet, FAQ, About Cropto).
  - Header перевірено та залишено без змін (відповідає вимогам).
  - Використано існуючі маршрути з query-параметрами для фільтрації.
- ✅ **Шаг 2**: Hero-секція — завершено:
  - Оновлено тексти заголовка/підзаголовка згідно специфікації.
  - Прив'язано 4 CTA-кнопки до правильних маршрутів.
- ✅ **Шаг 3**: Market Dashboard — завершено:
  - Додано описи джерел цін для кожної вкладки (UA/BR/AR).
  - Оновлено структуру карточок індексів (додано Source, sparkline, кнопки "View Index Market" / "View Options Market").
- ✅ **Шаг 4**: How Cropto Works — завершено:
  - Оновлено 6 кроків згідно специфікації.
  - Додано CTA-кнопку "Start Trading" в кінці блоку.
- ✅ **Шаг 5**: Сторінки Spot / Options / Market Data — завершено:
  - Оновлено заголовки та підзаголовки сторінок через i18n.
  - SpotTrading (/spot-trading): "Index Trading" / "Торгівля індексами".
  - OptionChain (/options): "Options Trading" / "Торгівля опціонами".
  - MarketData (/market-data): "Market Data" / "Ринкові дані".
  - Додано i18n ключі для всіх заголовків (EN/UK).
  - Використано існуючі функціональні сторінки з наявними фільтрами та структурою.
- ✅ **Шаг 6**: Education / Testing — завершено:
  - EducationPage: додано hero-блок з описом через i18n, інтегровано `/docs/about.{lang}.md` та `/docs/faq.{lang}.md`.
  - TestingPage: оновлено заголовки через i18n (`page.testing.title`, `page.testing.subtitle`).
  - Обидві сторінки використовують глобальний перемикач мови та автоматично завантажують відповідні markdown-файли.
  - Додано i18n ключі для обох сторінок (EN/UK).
- ✅ **Шаг 7**: i18n coverage (Header, Education, OptionChain) — завершено:
  - Header: замінено hardcoded "Wallet", "Waitlist", "Option & Forward Chain" на i18n ключі (`nav.wallet`, `nav.waitlist`, `nav.chain`).
  - EducationPage: замінено hardcoded "Topics", "Scenarios", "Option Calculator", "Read scenario" на i18n ключі.
  - OptionChain: замінено hardcoded "Create Option" на `button.createOption`.
  - Додано відсутні i18n ключі в EN/UK локалі.
- ✅ **Шаг 8**: Повне i18n покриття основних сторінок — завершено:
  - Portfolio.tsx: замінено всі hardcoded рядки (метрики, Collateral & Risk, таблиці позицій, time-to-expiry з pluralization, empty states).
  - SpotTrading.tsx: перекладено всі UI тексти (торгові пари, графіки, історія, Order Book).
  - MarketData.tsx: додано i18n для секцій GRAINS/OILSEEDS, Volatility & History, повідомлень про помилки.
  - OptionChain.tsx: перекладено фільтри, analytics tabs, empty states, Order Book.
  - Додано ключі: `page.portfolio.*`, `page.spot.*`, `page.marketData.*`, `page.options.*` (EN/UK).
  - Реалізовано pluralization для time-to-expiry та margin calls.
  - Всі JSON файли валідні, TypeScript компілюється.
- **Шаг 9** (окремо, позначено): Інтеграція реальних індексів з Бразилії/Аргентини (без реалізації зараз).

## Відкриті питання (UNCONFIRMED)
- Який інстанс коду вважати основним: GitHub branch `release/demo` чи стан на прод-деплої?
- Чи збережена демо-база в Supabase (users/options тощо), чи потрібно її відновлювати?
- Який зараз точний стек деплою: Runway тільки для бекенду чи бек+фронт, чи є окремий статичний хост для фронту?
- Чи справді Supabase зараз падає завжди, чи це тільки локальна конфігурація (secrets/env)?
- Для пілота:
  - чи використовуємо тільки Supabase як єдине джерело істини для users/options,
  - чи допускаємо фолбек на file-DB (скоріше небажано для реальних партнерів)?

## Робочий набір
- Репозиторій: https://github.com/markoblogo/cropto-v0.git
- Основна гілка для деплою/бекапу: `release/demo`
- Команда пуша на GitHub: `git push origin release/demo`
- Правило для ассистента: після значних змін коду пропонувати пуш у гілку `release/demo` командою `git push origin release/demo`.
- **Оновлювати CASCADELOG.md після кожного завершеного завдання** (див. правила вище).
- Backend (локально): `PORT=5002 DEMO_RELAX_CROPT_CHECK=true npx tsx server/index.ts`
- Frontend (локально): `cd client && npm run dev`
- Основні директорії:
  - `server/` — бекенд (Express, Supabase, on-chain сервіси).
  - `client/` — фронтенд (Vite + React + i18n).
  - `docs/`, `public/docs/` — текстова документація та markdown-сторінки.
- БД: Supabase (Postgres), деталі з’єднання у `.env` / secrets (НЕ включати в цей файл).
