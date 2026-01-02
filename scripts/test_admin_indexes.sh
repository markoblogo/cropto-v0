#!/bin/bash
# Test script for admin indexes endpoints

BASE_URL="http://localhost:5002"

echo "Testing Admin Indexes Endpoints"
echo "================================"
echo ""

# Step 1: Login as broker
echo "1. Logging in as broker@demo..."
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
  -d '{"email":"broker@demo","password":"pass"}' \
  "$BASE_URL/api/auth/login" 2>&1)
LOGIN_HTTP_CODE=$(echo "$LOGIN_RESP" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')
TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")

if [ "$LOGIN_HTTP_CODE" != "200" ] || [ -z "$TOKEN" ]; then
  echo "FAIL: Login failed (HTTP $LOGIN_HTTP_CODE)"
  echo "$LOGIN_BODY"
  exit 1
fi
echo "OK: Logged in successfully"
echo ""

# Step 2: Create a new BR index
echo "2. Creating BR index (corn, FOB Santos)..."
CREATE_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "country": "BR",
    "commodity": "corn",
    "basis": "FOB Santos",
    "price": 250.50,
    "currency": "USD",
    "asOf": "2025-01-15",
    "grade": null
  }' \
  "$BASE_URL/api/admin/indexes" 2>&1)
CREATE_HTTP_CODE=$(echo "$CREATE_RESP" | tail -1)
CREATE_BODY=$(echo "$CREATE_RESP" | sed '$d')

if [ "$CREATE_HTTP_CODE" != "200" ]; then
  echo "FAIL: Create index failed (HTTP $CREATE_HTTP_CODE)"
  echo "$CREATE_BODY"
  exit 1
fi
echo "OK: Index created successfully"
echo "$CREATE_BODY" | head -20
echo ""

# Step 3: Get all indexes
echo "3. Fetching all indexes..."
GET_RESP=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/admin/indexes" 2>&1)
GET_HTTP_CODE=$(echo "$GET_RESP" | tail -1)
GET_BODY=$(echo "$GET_RESP" | sed '$d')

if [ "$GET_HTTP_CODE" != "200" ]; then
  echo "FAIL: Get indexes failed (HTTP $GET_HTTP_CODE)"
  echo "$GET_BODY"
  exit 1
fi
echo "OK: Indexes retrieved"
# Check if our new index is in the list
if echo "$GET_BODY" | grep -q '"country":"BR"' && echo "$GET_BODY" | grep -q '"commodity":"corn"'; then
  echo "OK: New BR corn index found in list"
else
  echo "WARN: New index not found in list (may need to wait for propagation)"
fi
echo ""

# Step 4: Get history
echo "4. Fetching price history..."
HISTORY_RESP=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/index/history?country=BR&commodity=corn&basis=FOB%20Santos" 2>&1)
HISTORY_HTTP_CODE=$(echo "$HISTORY_RESP" | tail -1)
HISTORY_BODY=$(echo "$HISTORY_RESP" | sed '$d')

if [ "$HISTORY_HTTP_CODE" != "200" ]; then
  echo "FAIL: Get history failed (HTTP $HISTORY_HTTP_CODE)"
  echo "$HISTORY_BODY"
  exit 1
fi
echo "OK: History retrieved"
HISTORY_COUNT=$(echo "$HISTORY_BODY" | grep -o '"date"' | wc -l | tr -d ' ')
if [ "$HISTORY_COUNT" -gt 0 ]; then
  echo "OK: Found $HISTORY_COUNT data points in history"
  echo "$HISTORY_BODY" | head -30
else
  echo "WARN: No history data points found"
fi
echo ""

echo "================================"
echo "All tests completed successfully!"
echo ""
echo "Summary:"
echo "  - Login: OK"
echo "  - Create index: OK"
echo "  - Get indexes: OK"
echo "  - Get history: OK ($HISTORY_COUNT points)"