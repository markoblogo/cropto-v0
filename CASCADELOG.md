CASCADELOG — Cropto

Ціль (критерії успіху)
	•	Запустити робочий Pre-MVP Cropto для пілота з 2–3 партнерами:
	•	фермери та трейдери можуть створювати, матчити і виконувати опціони на зерно;
	•	є базова логіка margin call, settlement і PnL;
	•	є інтеграція з індексом Spike (через Telegram або ручне введення);
	•	є мінімальний on-chain шар: CROPT (ERC-20) + NFT опціонів (ERC-721) на Polygon Amoy для демонстрації;
	•	продукт доступний на публічному домені, з демо-акаунтами та інструкцією з тестування (EN/UK);
	•	ринковий дашборд показує індекси по Україні (Spike) та AR/BR/US (IGC), з подальшим масштабуванням на ES/PT.

Обмеження / допущення
	•	1 розробник + AI-асистенти; робимо все поетапно, без перефакторування «все й одразу».
	•	Інфраструктура: GitHub (код) + Runway/host (деплой бек/фронт) + Supabase (Postgres) + Polygon Amoy (тестнет).
	•	Це пілотна версія, не фінальний фінансовий продукт: юридика / ліцензії вирішуються окремо.
	•	Для демо дозволено послаблення частини risk-чеків (маржа, CROPT баланс), але всі такі послаблення мають бути задокументовані.

Правила ведення логу
	•	Оновлювати після кожного завершеного завдання рівня feature / помітного UX-поліпшення / інтеграції.
	•	НЕ фіксувати: дрібні багфікси, рефакторинг без змін функціональності, типові технічні задачі.
	•	Фіксувати: нові фічі, значні покращення UX/UI, важливі інтеграції, milestones.
	•	Формат запису: коротко що зроблено, ключові зміни, статус (завершено/в процесі).

Ключові рішення (high-level)
	•	Модель:
	•	NFT-опціони на зерно (CALL/PUT), прив'язані до Spike Spot Commodity Index.
	•	Фермер купує опціон (хеджує ціну), трейдер продає і вносить колатерал.
	•	Margin call при ~80% використання маржі, forced settlement при невиконанні.
	•	Розрахунки спочатку off-chain (фіат / внутрішній баланс), on-chain CROPT — як «вітрина» та можливість виводу.
	•	Ролі:
	•	farmer, trader, broker (Spike Brokers) + admin.
	•	Дані:
	•	Основна БД — Supabase (таблиці users, options, margin_calls, settlements, transactions, indexPrices, notifications, feedback, onchain_tx тощо).
	•	On-chain:
	•	CROPT ERC-20 на Polygon Amoy.
	•	CroptOptionNFT ERC-721 на Polygon Amoy; mint NFT для FILLED/EXERCISED опціонів з збереженням tokenId та txHash.
	•	Індекси:
	•	Україна — Telegram-канал @spike_brokers, парсер повідомлень з цінами.
	•	AR/BR/US — парсер IGC export prices (HTML із https://www.igc.int/en/markets/marketinfo-prices.aspx) з агрегацією в таблиці indexPrices.
	•	UI / UX:
	•	React + Vite, локалізація EN/UK через react-i18next.
	•	Основні сторінки: Home, Dashboard, Portfolio, Spot, Options, Market Data, Education/Testing, Admin.

Статус

Зроблено (узагальнено)
	•	Backend / core:
	•	Реалізовані: auth, створення опціонів, matching engine, exercise & settlement, PnL-дашборд, базова margin-call логіка.
	•	Виправлено логін: Supabase використовується як основне джерело users; при збої є fallback на file-DB, але на поточному середовищі Supabase працює стабільно.
	•	Додано DEMO_RELAX_CROPT_CHECK: у демо-режимі дозволяє виконання опціону навіть при недостатньому CROPT балансі (логуються warning-и, бізнес-логіка максимально збережена).
	•	On-chain:
	•	CROPT ERC-20 + NFT-контракт опціонів на Polygon Amoy.
	•	API для mint та відслідковування tx-статусів інтегровано в бекенд.
	•	БД / міграції:
	•	Налаштовано повноцінний міграційний скрипт: npm run migrate (tsx db/migrate.ts).
	•	Успішно застосовано всі міграції 001–014, включно з:
	•	виправленням NULL у expiry_window (бекфіл '3M' + NOT NULL),
	•	додаванням IGC-полів до indexPrices (country, label, asOfDate, dailyChangePct, annualChangePct, low52w, high52w, rawRow).
	•	Індекси:
	•	Україна: модель `indexPrices` + API + парсер Telegram-повідомлень (Spike) — працює, `source = "spike_telegram"`.
	•	IGC: реалізовано парсер HTML (`igcPriceService`), job `server/jobs/igcPoller.ts` та debug-скрипт `scripts/debugIgcIndexPrices.ts`.
	•	На поточну дату в БД зберігається 22 записи з `source = "IGC"`:
	•	AR: 8 записів (wheat, maize, barley, soybeans, rice).
	•	US: 12 записів (wheat, maize, barley, soybeans, rice).
	•	BR: 2 записи (soybeans, maize).
	•	API:
	•	Market Dashboard API: `/api/market-dashboard` віддає:
	•	UA-індекси зі Spike (`source = "spike_telegram"`),
	•	для BR/AR/US спочатку використовуються IGC-дані; fallback на mock (`source = "mock"`) спрацьовує лише якщо для країни немає жодного IGC-запису.
	•	товар `sugar` видалено з mock-даних.
	•	E2E Smoke Test: створено скрипт `scripts/e2e_smoke.ts` для перевірки основних флоу (health, login, create/match/exercise option, portfolio verification).
	•	Фронтенд / homepage:
	•	Перероблено навігацію та footer згідно PDF-специфікації головної сторінки (Index Trading, Options Trading, Market Data, Documentation, Wallet, FAQ, About Cropto).
	•	Оновлено Hero-секцію, How Cropto Works, Market Dashboard-блок на головній.
	•	Оновлено заголовки/підзаголовки сторінок Spot, Options, Market Data через i18n (EN/UK).
	•	Education / Testing: інтегровано markdown-доки (docs/about.*, docs/faq.*, docs/testing.*) + i18n заголовки.
	•	Локалізація (факт):
	•	Додано багато i18n-ключів (nav.*, page.portfolio.*, page.spot.*, page.marketData.*, page.options.*, page.education.*, page.testing.* тощо).
	•	Перемикач мов EN/UK працює глобально.
	•	Реальний стан: значна частина основних сторінок уже сидить на i18n, але український текст покритий частково (на UI ще залишилось багато hardcoded EN-рядків).

Зараз
	•	Стабілізація IGC інтеграції:
	•	Парсер та API працюють коректно, дані збігаються з сайтом IGC.
	•	Додано константу `IGC_SERIES_MAPPING` для жорсткої фільтрації дозволених серій.
	•	Упроваджено валідацію в `igcPoller` для раннього виявлення проблем з парсингом.
	•	Локалізація:
	•	Переклад EN/UK на рівні ключів зроблений для більшості основних секцій.
	•	Фактично в UI українська версія виглядає як «приблизно 20–30% покриття»: багато тексту все ще hardcoded англійською (особливо всередині дашбордів та форм).

Далі (high-level план)
	•	✅ **Шаг 1**: Навігація та роутинг — завершено:
	  - Footer перероблено згідно специфікації (Index Trading, Options Trading, Market Data, Documentation, Wallet, FAQ, About Cropto).
	  - Header перевірено та залишено без змін (відповідає вимогам).
	  - Використано існуючі маршрути з query-параметрами для фільтрації.
	•	✅ **Шаг 2**: Hero-секція — завершено:
	  - Оновлено тексти заголовка/підзаголовка згідно специфікації.
	  - Прив'язано 4 CTA-кнопки до правильних маршрутів.
	•	✅ **Шаг 3**: Market Dashboard — завершено:
	  - Додано описи джерел цін для кожної вкладки (UA/BR/AR/US).
	  - Оновлено структуру карточок індексів (додано Source, sparkline, кнопки "View Index Market" / "View Options Market").
	•	✅ **Шаг 4**: How Cropto Works — завершено:
	  - Оновлено 6 кроків згідно специфікації.
	  - Додано CTA-кнопку "Start Trading" в кінці блоку.
	•	✅ **Шаг 5**: Сторінки Spot / Options / Market Data — завершено:
	  - Оновлено заголовки та підзаголовки сторінок через i18n.
	  - SpotTrading (/spot-trading): "Index Trading" / "Торгівля індексами".
	  - OptionChain (/options): "Options Trading" / "Торгівля опціонами".
	  - MarketData (/market-data): "Market Data" / "Ринкові дані".
	  - Додано i18n ключі для всіх заголовків (EN/UK).
	  - Використано існуючі функціональні сторінки з наявними фільтрами та структурою.
	•	✅ **Шаг 6**: Education / Testing — завершено:
	  - EducationPage: додано hero-блок з описом через i18n, інтегровано `/docs/about.{lang}.md` та `/docs/faq.{lang}.md`.
	  - TestingPage: оновлено заголовки через i18n (`page.testing.title`, `page.testing.subtitle`).
	  - Обидві сторінки використовують глобальний перемикач мови та автоматично завантажують відповідні markdown-файли.
	  - Додано i18n ключі для обох сторінок (EN/UK).
	•	✅ **Шаг 7**: i18n coverage (Header, Education, OptionChain) — завершено:
	  - Header: замінено hardcoded "Wallet", "Waitlist", "Option & Forward Chain" на i18n ключі (`nav.wallet`, `nav.waitlist`, `nav.chain`).
	  - EducationPage: замінено hardcoded "Topics", "Scenarios", "Option Calculator", "Read scenario" на i18n ключі.
	  - OptionChain: замінено hardcoded "Create Option" на `button.createOption`.
	  - Додано відсутні i18n ключі в EN/UK локалі.
	•	✅ **Шаг 8**: Повне i18n покриття основних сторінок — завершено:
	  - Portfolio.tsx: замінено всі hardcoded рядки (метрики, Collateral & Risk, таблиці позицій, time-to-expiry з pluralization, empty states).
	  - SpotTrading.tsx: перекладено всі UI тексти (торгові пари, графіки, історія, Order Book).
	  - MarketData.tsx: додано i18n для секцій GRAINS/OILSEEDS, Volatility & History, повідомлень про помилки.
	  - OptionChain.tsx: перекладено фільтри, analytics tabs, empty states, Order Book.
	  - Додано ключі: `page.portfolio.*`, `page.spot.*`, `page.marketData.*`, `page.options.*` (EN/UK).
	  - Реалізовано pluralization для time-to-expiry та margin calls.
	  - Всі JSON файли валідні, TypeScript компілюється.
	•	✅ **Шаг 9**: Інтеграція реальних індексів IGC (Brazil / Argentina / USA) — завершено:
	  - Додано `igcPoller`, який парсить таблиці IGC для wheat, maize, barley, soybeans і зберігає значення в таблиці `indexPrices` із `source = "IGC"`.
	  - Оновлено `server/services/igcPriceService.ts`: нормалізація країн через `COUNTRY_MAPPINGS`, фільтрація потрібних серій та прибирання «дивних» HRW/SRW з інших культур.
	  - Додано debug-логіку та скрипт `scripts/debugIgcIndexPrices.ts` для перевірки кількості записів по країнах і товарах.
	  - Оновлено `/api/market-dashboard`: для BR/AR/US спочатку використовуються IGC-дані; fallback на mock-дані спрацьовує лише якщо для країни немає жодного IGC-запису.
	  - Поточні референсні значення (перевірено на відповідність сайту IGC):
	    - **Brazil:** soybeans 414, maize 222.
	    - **Argentina:** wheat 212, maize 218, barley 213, soybeans 401.
	    - **USA:** wheat 239, maize 214, soybeans 417.

### Наступні кроки (після Шага 9)

	1.	Завершити локалізацію EN/UK:
	•	Допройти всі основні сторінки (Portfolio, Spot, Options, Market Data, Education, Testing, Admin) і прибрати hardcoded EN-рядки.
	•	Вирівняти структуру public/locales/en/common.json та public/locales/uk/common.json.
	2.	Підготовка до multi-lang (ES/PT):
	•	Спроєктувати схему додавання мов (es, pt) на базі існуючого i18n.
	•	Визначити, що буде перекладатися вручну, а що — через авто-переклад з подальшим review.
	3.	Автоматичний E2E-регрес:
	•	Оформити scripts/e2e_smoke.ts як регулярний healthcheck (npm-скрипт + інструкція, далі — інтеграція в CI/cron).
	•	Додати в smoke-тест перевірку IGC-даних (наявність AR/US/BR, коректний source).

Відкриті питання (UNCONFIRMED)
	•	Чи вибрано остаточно гілку release/demo як єдине джерело правди для коду (і локал, і прод-деплой орієнтуються тільки на неї)?
	•	IGC:
	•	✅ Вирішено: парсер стабільно збирає ціни по BR/AR/US (wheat/maize/barley/soybeans), числа збігаються з сайтом IGC.
	•	❓ Відкрите: чи потрібно виділяти окремий mapping-файл для серій та покрити це unit-тестами, чи достатньо поточної реалізації.
	•	Локалізація:
	•	Який мінімальний рівень покриття українською потрібен до пілоту (100% основних екранів чи допустимі англ. шматки)?
	•	Коли саме стартує робота над ES/PT (до пілоту чи після перших фідбеків з Латинської Америки)?

Робочий набір
	•	Репозиторій: https://github.com/markoblogo/cropto-v0.git
	•	Основна гілка для деплою/бекапу: release/demo
	•	Git-команди:
	•	Перевірка статусу: git status
	•	Коміт: git commit -am "..." (або через staged файли)
	•	Пуш: git push origin release/demo
	•	Backend (локально):
	•	Запуск API:
PORT=5002 DEMO_RELAX_CROPT_CHECK=true ENABLE_IGC_POLLING=false npx tsx server/index.ts
	•	Одноразовий запуск IGC-job:
npx tsx server/jobs/igcPoller.ts
	•	Запуск міграцій:
npm run migrate
	•	Debug IGC:
npm run debug:igc
	•	Frontend (локально):
	•	cd client && npm run dev
	•	Основні директорії:
	•	server/ — бекенд (Express, Supabase, on-chain сервіси, jobs).
	•	client/ — фронтенд (Vite + React + i18n).
	•	db/migrations/ — SQL-міграції.
	•	scripts/ — утиліти та e2e smoke-тести.
	•	docs/, public/docs/ — текстова документація та markdown-сторінки.
	•	БД:
	•	Supabase (Postgres), деталі з'єднання у .env / secrets (не включати в лог).
	•	Таблиця indexPrices використовується як єдине джерело для ринкових індексів (Spike + IGC).
