# Cropto API - Примеры использования

Эта документация содержит примеры curl команд для работы с API платформы Cropto.

## Базовый URL

Для локального тестирования:
```bash
export PREVIEW_URL="http://localhost:5000"
```

Для production/preview:
```bash
export PREVIEW_URL="https://your-app.repl.co"
```

## 1. Аутентификация

### Логин и получение токена

```bash
# Логин пользователя
curl -s -X POST $PREVIEW_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"farmer@demo","password":"pass"}' | jq .
```

**Ответ:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_1762284081440_877dimuju",
    "email": "farmer@demo",
    "role": "farmer",
    "createdAt": "2025-11-04T19:21:21.534Z",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "network": "1"
  }
}
```

**Сохраните токен в переменную:**
```bash
export TOKEN=$(curl -s -X POST $PREVIEW_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"farmer@demo","password":"pass"}' | jq -r '.token')
```

### Демо учетные записи

| Роль   | Email         | Пароль |
|--------|---------------|--------|
| Farmer | farmer@demo   | pass   |
| Trader | trader@demo   | pass   |
| Broker | broker@demo   | pass   |

### Регистрация нового пользователя

```bash
curl -s -X POST $PREVIEW_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "securePassword123",
    "role": "trader"
  }' | jq .
```

### Проверка текущего пользователя

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/auth/me | jq .
```

## 2. Управление кошельком

### Привязка кошелька к аккаунту

```bash
curl -s -X POST $PREVIEW_URL/api/wallet/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xAbCd1234567890AbCd1234567890AbCd12345678",
    "network": "mumbai"
  }' | jq .
```

**Ответ:**
```json
{
  "user": {
    "id": "user_1762284081440_877dimuju",
    "email": "farmer@demo",
    "role": "farmer",
    "walletAddress": "0xAbCd1234567890AbCd1234567890AbCd12345678",
    "network": "mumbai"
  }
}
```

### Проверка привязанного кошелька

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/wallet/me | jq .
```

**Ответ:**
```json
{
  "walletAddress": "0xAbCd1234567890AbCd1234567890AbCd12345678",
  "network": "mumbai"
}
```

### Проверка баланса CROPT токенов

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/onchain/balance/0xYourWalletAddress | jq .
```

## 3. Опционы

### Получить список всех опционов

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/options | jq .
```

### Создать новый опцион

```bash
curl -s -X POST $PREVIEW_URL/api/options \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "WHEAT PUT Dec 2025",
    "type": "PUT",
    "strike": "230.00",
    "qty": "100",
    "premium": "5.50",
    "collateral": "500.00",
    "currency": "FIAT",
    "expiryDate": "2025-12-31"
  }' | jq .
```

### Получить детали опциона

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/options/{optionId} | jq .
```

### Отменить опцион

```bash
curl -s -X POST $PREVIEW_URL/api/options/{optionId}/cancel \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 4. Торговля

### Сопоставить опцион (купить/продать)

```bash
curl -s -X POST $PREVIEW_URL/api/options/{optionId}/match \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Исполнить опцион

```bash
curl -s -X POST $PREVIEW_URL/api/options/{optionId}/exercise \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "spotPrice": "240.00"
  }' | jq .
```

## 5. Портфолио

### Получить портфолио пользователя

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/portfolio/me | jq .
```

**Ответ включает:**
- `totalPnL`: Общая прибыль/убыток (реализованный + нереализованный)
- `totalLockedCollateral`: Общая сумма заблокированного залога
- `openPositionsCount`: Количество открытых позиций
- `marginCallsCount`: Количество маржин-коллов
- `positions`: Массив всех позиций с деталями P&L

## 6. Индекс цен

### Получить последнюю цену индекса

```bash
curl -s $PREVIEW_URL/api/index/latest | jq .
```

**Ответ:**
```json
{
  "commodity": "WHEAT",
  "price": "240.00000000",
  "createdAt": "2025-11-06T10:00:00.000Z",
  "history": [
    {"commodity": "WHEAT", "price": "238.50000000", "createdAt": "2025-11-05T10:00:00.000Z"},
    ...
  ]
}
```

### Обновить индекс через Telegram webhook

```bash
curl -s -X POST $PREVIEW_URL/api/index \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_SECRET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "WHEAT 245.50"
    }
  }' | jq .
```

**Формат сообщения:** `COMMODITY PRICE` (например, `WHEAT 245.50`)

## 7. Маржин-коллы

### Получить маржин-коллы пользователя

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/margincalls | jq .
```

### Пополнить маржин-колл

```bash
curl -s -X POST $PREVIEW_URL/api/margincalls/{marginCallId}/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100.00",
    "currency": "FIAT"
  }' | jq .
```

## 8. Уведомления

### Получить все уведомления

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/notifications | jq .
```

### Получить только непрочитанные уведомления

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PREVIEW_URL/api/notifications?unread=true" | jq .
```

### Отметить уведомление как прочитанное

```bash
curl -s -X POST $PREVIEW_URL/api/notifications/{notificationId}/mark-read \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 9. Блокчейн операции

### Минт CROPT токенов

```bash
curl -s -X POST $PREVIEW_URL/api/onchain/mint \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toAddress": "0xYourWalletAddress",
    "amount": "1000"
  }' | jq .
```

### Проверить статус транзакции

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/onchain/transactions | jq .
```

## 10. Админ эндпоинты (только для Broker)

### Обработать просроченные маржин-коллы

```bash
curl -s -X POST $PREVIEW_URL/api/jobs/process-overdue-margincalls \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "indexPrice": "240.00"
  }' | jq .
```

### Ежедневный расчет (Daily Settlement)

```bash
curl -s -X POST $PREVIEW_URL/api/jobs/daily-settle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "indexPrice": "240.00"
  }' | jq .
```

### Получить данные для сверки

```bash
# Транзакции
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PREVIEW_URL/api/admin/reconciliation/transactions?startDate=2025-11-01&endDate=2025-11-30" | jq .

# Расчеты
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PREVIEW_URL/api/admin/reconciliation/settlements?startDate=2025-11-01&endDate=2025-11-30" | jq .

# Маржин-коллы
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PREVIEW_URL/api/admin/reconciliation/margincalls?startDate=2025-11-01&endDate=2025-11-30&status=OPEN" | jq .
```

### Управление индексом (Broker only)

```bash
# Получить историю индекса
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PREVIEW_URL/api/admin/index?commodity=WHEAT" | jq .

# Создать новую цену индекса вручную
curl -s -X POST $PREVIEW_URL/api/admin/index \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "commodity": "WHEAT",
    "price": "242.75"
  }' | jq .
```

## 11. Обратная связь

### Отправить фидбек (без авторизации)

```bash
curl -s -X POST $PREVIEW_URL/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "role": "trader",
    "message": "Great platform! Suggestion: add more chart types.",
    "screenshotUrl": "https://example.com/screenshot.png"
  }' | jq .
```

### Получить весь фидбек (Broker only)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $PREVIEW_URL/api/feedback | jq .
```

### Отметить фидбек как решенный (Broker only)

```bash
curl -s -X POST $PREVIEW_URL/api/feedback/{feedbackId}/resolve \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 12. Health Check

### Проверить статус API

```bash
curl -s $PREVIEW_URL/api/health | jq .
```

**Ответ:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-06T11:00:00.000Z"
}
```

## Полезные советы

### Комбинированный скрипт для быстрого тестирования

```bash
#!/bin/bash

# Настройка
export PREVIEW_URL="http://localhost:5000"

# Логин
export TOKEN=$(curl -s -X POST $PREVIEW_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"farmer@demo","password":"pass"}' | jq -r '.token')

echo "Token: ${TOKEN:0:20}..."

# Привязать кошелек
curl -s -X POST $PREVIEW_URL/api/wallet/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"address":"0xAbCd1234567890AbCd1234567890AbCd12345678","network":"mumbai"}' | jq .

# Проверить кошелек
curl -s -H "Authorization: Bearer $TOKEN" $PREVIEW_URL/api/wallet/me | jq .

# Получить портфолио
curl -s -H "Authorization: Bearer $TOKEN" $PREVIEW_URL/api/portfolio/me | jq .

# Получить опционы
curl -s -H "Authorization: Bearer $TOKEN" $PREVIEW_URL/api/options | jq .
```

### Обработка ошибок

Все ошибки возвращаются в формате:
```json
{
  "error": "Описание ошибки"
}
```

Коды состояния:
- `200` - Успешно
- `201` - Создано
- `400` - Ошибка валидации
- `401` - Требуется авторизация
- `403` - Доступ запрещен (неверная роль)
- `404` - Не найдено
- `409` - Конфликт (например, опцион уже сопоставлен)
- `500` - Ошибка сервера

### Форматирование вывода с jq

```bash
# Красивый вывод
curl -s ... | jq .

# Извлечь конкретное поле
curl -s ... | jq '.token'

# Извлечь несколько полей
curl -s ... | jq '{id: .id, email: .user.email, role: .user.role}'

# Фильтровать массивы
curl -s ... | jq '.positions[] | select(.status == "OPEN")'
```
