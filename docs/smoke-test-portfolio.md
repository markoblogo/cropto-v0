# Portfolio Smoke Test Guide

## Цель
Проверить, что Portfolio правильно отображает:
- Option Positions (опционные позиции пользователя)
- Net Exposure (учёт опционов в нетто-экспозиции)
- Unrealized P&L (нереализованная прибыль/убыток)

## Предварительные условия
1. Приложение запущено (`npm run dev`)
2. У вас есть аккаунт с правами trader/broker
3. В системе есть товар Wheat 11.5% с установленной ценой

## Шаги тестирования

### 1. Проверка текущей цены Wheat 11.5%
- Откройте Dashboard или Index Management
- Найдите текущую цену Wheat 11.5% (например, $240/ton)
- Запишите эту цену: `CURRENT_PRICE = $___`

### 2. Создание in-the-money CALL опциона
- Перейдите в Options Book или создайте опцион через UI
- Параметры опциона:
  - **Type**: CALL
  - **Commodity**: Wheat 11.5%
  - **Strike**: `CURRENT_PRICE * 0.8` (например, если цена $240, то strike = $192/ton)
  - **Quantity**: 10 тонн
  - **Premium**: $5/ton
  - **Expiration**: 3 месяца от текущей даты
- Создайте опцион
- Убедитесь, что опцион появился в Options Book

### 3. Матчинг опциона (если нужно)
- Если опцион в статусе OPEN, найдите контрагента и выполните match
- Или создайте опцион, где вы уже являетесь buyer/seller
- Убедитесь, что опцион в статусе FILLED

### 4. Обновление цены Wheat 11.5%
- Перейдите в Index Management (нужны права broker)
- Обновите цену Wheat 11.5% до `CURRENT_PRICE * 1.3` (например, $240 → $312/ton)
- Это сделает CALL опцион явно in-the-money:
  - Strike: $192/ton
  - Current: $312/ton
  - Intrinsic value: ($312 - $192) * 10 = $1,200

### 5. Проверка Portfolio

#### 5.1 Option Positions
- Откройте `/portfolio`
- Проверьте секцию **Option Positions**:
  - ✅ Должна появиться строка с созданным опционом
  - ✅ Type: CALL
  - ✅ Side: LONG (если вы buyer) или SHORT (если вы seller)
  - ✅ Qty: 10.00
  - ✅ Strike: $192.00/ton (или соответствующее значение)
  - ✅ Entry Premium: отрицательное для LONG, положительное для SHORT
  - ✅ P&L: должно быть положительное значение для LONG CALL in-the-money

#### 5.2 Net Exposure
- Проверьте секцию **Net Exposure**:
  - ✅ Должна быть строка для Wheat 11.5%
  - ✅ **Spot (t)**: текущая спот-позиция (может быть 0)
  - ✅ **Options (t)**: 
    - Для LONG CALL: должно быть `+10.00`
    - Для SHORT CALL: должно быть `-10.00`
  - ✅ **Net (t)**: сумма Spot + Options
  - ✅ **Current Price ($/t)**: должна быть новая цена ($312/ton)
  - ✅ **Net Value ($)**: Net (t) * Current Price

#### 5.3 Summary Cards
- Проверьте карточки вверху страницы:
  - ✅ **Unrealized P&L**: должно быть положительное значение
    - Для LONG CALL: `(intrinsic - premium) = ($1,200 - $50) = $1,150`
    - Для SHORT CALL: `(premium - intrinsic) = ($50 - $1,200) = -$1,150`
  - ✅ **Total P&L**: должно быть равно Realized + Unrealized
  - ✅ **Open Positions**: должно быть ≥ 1

### 6. Проверка в DevTools
- Откройте Network tab в браузере
- Найдите запрос `GET /api/portfolio/me`
- Проверьте ответ:
  ```json
  {
    "totalPnL": "...",
    "realizedPnL": "0.00",
    "unrealizedPnL": "...",  // должно быть ненулевое значение
    "openPositions": 1,
    "positions": [
      {
        "optionId": "...",
        "type": "CALL",
        "role": "buyer",  // или "seller"
        "pnl": "...",     // должно быть положительное для LONG in-the-money
        ...
      }
    ]
  }
  ```

## Ожидаемые результаты

### Для LONG CALL (buyer):
- **Intrinsic value**: `max(0, $312 - $192) * 10 = $1,200`
- **Premium paid**: `$5 * 10 = $50`
- **Unrealized P&L**: `$1,200 - $50 = $1,150`
- **Net Exposure Options (t)**: `+10.00`

### Для SHORT CALL (seller):
- **Intrinsic value**: `max(0, $312 - $192) * 10 = $1,200`
- **Premium received**: `$5 * 10 = $50`
- **Unrealized P&L**: `$50 - $1,200 = -$1,150`
- **Net Exposure Options (t)**: `-10.00`

## Возможные проблемы и решения

### Проблема: Option Positions пустая
- **Проверка**: Откройте консоль сервера, найдите логи `[Portfolio]`
- **Решение**: Убедитесь, что опцион имеет `buyerId` или `issuerId` равный вашему `userId`

### Проблема: Net Exposure не учитывает опционы
- **Проверка**: В консоли браузера проверьте `optionsExposure` в React DevTools
- **Решение**: Убедитесь, что опцион в статусе OPEN или FILLED

### Проблема: Unrealized P&L неправильный знак/размер
- **Проверка**: Сравните с формулой в `server/utils/finance.ts`
- **Решение**: Проверьте конвертацию strike (должен быть умножен на 1000 для перевода из $/kg в $/ton)

## Логи для отладки

В консоли сервера должны появиться логи:
```
[Portfolio] Current userId: ...
[Portfolio] Total options found: ...
[Portfolio] Processing option ...: { buyerId, issuerId, isBuyer, isSeller, status }
[Portfolio] Unrealized P&L calc for option ...: { currentPricePerTon, strikePerTon, intrinsicValue, ... }
[Portfolio] Calculated P&L: ...
[Portfolio] Valid positions count: ...
[Portfolio] Summary: totalPnL=..., openPositions=..., marginCalls=...
```

