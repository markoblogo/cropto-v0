# IGC Price Integration - Звіт про реалізацію

## ✅ Виконано

Інтегровано парсинг цін з IGC (International Grains Council) для США, Бразилії та Аргентини.

## Змінені/створені файли

### База даних
- `db/migrations/014_add_igc_fields_to_index_prices.sql` - міграція з новими полями
- `shared/schema.ts` - оновлено `indexPrices` таблицю

### Backend
- `server/services/igcPriceService.ts` - сервіс парсингу HTML з IGC
- `server/services/igcUpsert.ts` - функція upsert для збереження даних
- `server/jobs/igcPoller.ts` - job для періодичного оновлення
- `server/routes.ts` - оновлено `/api/market-dashboard` для IGC даних
- `server/services/mockMarketData.ts` - додано "IGC" до типу source

### Frontend
- `client/src/hooks/useMarketDashboard.ts` - додано "IGC" до типу source
- `client/src/components/home/MarketDashboard.tsx` - оновлено відображення source

### Тести
- `tests/igcPriceService.test.ts` - unit-тести для парсингу

## Як викликати job локально

```bash
# Один раз (для тестування)
npx tsx server/jobs/igcPoller.ts

# Або через env змінну (автоматично при старті сервера)
ENABLE_IGC_POLLING=true npm run dev
```

## Налаштування

Додати в `.env`:
```env
ENABLE_IGC_POLLING=true
IGC_POLL_INTERVAL_HOURS=24  # За замовчуванням 24 години
```

## Приклад відповіді /api/market-dashboard

```json
{
  "ua": [...],
  "br": [
    {
      "commodity": "soybeans",
      "country": "BR",
      "basis": "Brazil Parana Soybeans",
      "price": 485.50,
      "currency": "USD",
      "change24h": 2.3,
      "source": "IGC",
      "asOf": "2024-01-15T00:00:00.000Z"
    }
  ],
  "ar": [...],
  "us": [...]
}
```

## Примітки

1. Парсер є базовим - може знадобитися доопрацювання після тестування на реальному HTML IGC
2. Job запускається автоматично при старті сервера, якщо `ENABLE_IGC_POLLING=true`
3. UI показує "Source: IGC export prices" для IGC даних на картках Market Dashboard
