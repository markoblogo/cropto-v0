#!/bin/bash

set -e

API_URL="${API_URL:-http://localhost:5000}"
TELEGRAM_BOT_SECRET_TOKEN="${TELEGRAM_BOT_SECRET_TOKEN:-test_secret_token}"

echo "🧪 Testing Telegram Parser Integration"
echo "=================================="
echo ""

echo "Test 1: Simple Format (Wheat 11.5% 240.50)"
echo "------------------------------------"
RESPONSE=$(curl -s -X POST "$API_URL/api/index" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_BOT_SECRET_TOKEN" \
  -d '{
    "message": {
      "message_id": 10001,
      "chat": {
        "id": 12345,
        "username": "spike_brokers"
      },
      "text": "Wheat115 240.50",
      "date": 1699776000
    }
  }')
echo "Response: $RESPONSE"
echo ""

echo "Test 2: Spike Brokers Format (Ukrainian)"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "$API_URL/api/index" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_BOT_SECRET_TOKEN" \
  -d '{
    "message": {
      "message_id": 10002,
      "chat": {
        "id": 12345,
        "username": "spike_brokers"
      },
      "text": "SPIKE Spot Commodity Index Ukraine\n11.11.2025\n\nCPT ОДЕСА, УКРАЇНА (експорт)\n\n• Кукурудза – 208$ (0$)\n• Пшениця 11.5pro – 221$ (0$)\n• Пшениця фураж – 211$ (0$)\n• Соя ГМО – 412$ (0$)",
      "date": 1699776000
    }
  }')
echo "Response: $RESPONSE"
echo ""

echo "Test 3: Retrieve Latest Index Price"
echo "-----------------------------------"
# Use canonical Wheat 11.5% name (legacy WHEAT will be normalized on the server)
LATEST_RESPONSE=$(curl -s "$API_URL/api/index/latest?commodity=Wheat%2011.5%25")
echo "Response: $LATEST_RESPONSE"
echo ""

LATEST_PRICE=$(echo "$LATEST_RESPONSE" | grep -o '"price":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$LATEST_PRICE" ]; then
  echo "✅ Latest Wheat 11.5% price: \$$LATEST_PRICE"
else
  echo "⚠️  Could not extract price from response"
fi
echo ""

echo "Test 4: Duplicate Message (should skip)"
echo "---------------------------------------"
RESPONSE=$(curl -s -X POST "$API_URL/api/index" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_BOT_SECRET_TOKEN" \
  -d '{
    "message": {
      "message_id": 10002,
      "chat": {
        "id": 12345,
        "username": "spike_brokers"
      },
      "text": "• Пшениця 11.5pro – 225$ (4$)",
      "date": 1699776100
    }
  }')
echo "Response: $RESPONSE"
SKIPPED=$(echo "$RESPONSE" | grep -o '"skipped":true')
if [ -n "$SKIPPED" ]; then
  echo "✅ Correctly skipped duplicate message"
else
  echo "⚠️  Expected duplicate to be skipped"
fi
echo ""

echo "Test 5: Invalid Format (should fail)"
echo "------------------------------------"
RESPONSE=$(curl -s -X POST "$API_URL/api/index" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_BOT_SECRET_TOKEN" \
  -d '{
    "message": {
      "message_id": 10003,
      "chat": {
        "id": 12345,
        "username": "spike_brokers"
      },
      "text": "This is just random text without any price",
      "date": 1699776200
    }
  }')
echo "Response: $RESPONSE"
ERROR=$(echo "$RESPONSE" | grep -o '"error"')
if [ -n "$ERROR" ]; then
  echo "✅ Correctly rejected invalid format"
else
  echo "⚠️  Expected error for invalid format"
fi
echo ""

echo "=================================="
echo "✅ All tests completed!"
echo ""
echo "To run this test:"
echo "  TELEGRAM_BOT_SECRET_TOKEN=your_secret bash scripts/test_telegram_parser.sh"
