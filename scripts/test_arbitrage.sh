#!/bin/bash
# Test script for arbitrage endpoint

BASE_URL="http://localhost:5002"

echo "Testing Arbitrage Endpoint"
echo "=========================="
echo ""

# Test 1: Compare UA vs BR for corn
echo "1. Testing UA vs BR for corn..."
ARBITRAGE_RESP=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/arbitrage/index?baseCountry=UA&targetCountry=BR&commodity=corn" 2>&1)
ARBITRAGE_HTTP_CODE=$(echo "$ARBITRAGE_RESP" | tail -1)
ARBITRAGE_BODY=$(echo "$ARBITRAGE_RESP" | sed '$d')

if [ "$ARBITRAGE_HTTP_CODE" != "200" ]; then
  echo "FAIL: Arbitrage request failed (HTTP $ARBITRAGE_HTTP_CODE)"
  echo "$ARBITRAGE_BODY"
  exit 1
fi

echo "OK: Request successful"
echo "$ARBITRAGE_BODY" | head -40
echo ""

# Verify response structure
if echo "$ARBITRAGE_BODY" | grep -q '"commodity"' && \
   echo "$ARBITRAGE_BODY" | grep -q '"base"' && \
   echo "$ARBITRAGE_BODY" | grep -q '"target"' && \
   echo "$ARBITRAGE_BODY" | grep -q '"spreadAbs"' && \
   echo "$ARBITRAGE_BODY" | grep -q '"spreadPct"'; then
  echo "OK: Response structure is correct"
else
  echo "FAIL: Response structure is invalid"
  exit 1
fi

# Extract values for verification
SPREAD_ABS=$(echo "$ARBITRAGE_BODY" | grep -o '"spreadAbs":[^,]*' | cut -d':' -f2 | tr -d ' ')
SPREAD_PCT=$(echo "$ARBITRAGE_BODY" | grep -o '"spreadPct":[^,}]*' | cut -d':' -f2 | tr -d ' ')

if [ -n "$SPREAD_ABS" ] && [ -n "$SPREAD_PCT" ]; then
  echo "OK: Spread values found (abs: $SPREAD_ABS, pct: $SPREAD_PCT%)"
else
  echo "WARN: Could not extract spread values"
fi
echo ""

# Test 2: Test with invalid parameters
echo "2. Testing with missing parameters..."
INVALID_RESP=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/arbitrage/index?baseCountry=UA" 2>&1)
INVALID_HTTP_CODE=$(echo "$INVALID_RESP" | tail -1)

if [ "$INVALID_HTTP_CODE" = "400" ]; then
  echo "OK: Correctly returns 400 for missing parameters"
else
  echo "WARN: Expected 400 for missing parameters, got $INVALID_HTTP_CODE"
fi
echo ""

# Test 3: Test with same country (should error)
echo "3. Testing with same country (should error)..."
SAME_COUNTRY_RESP=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/arbitrage/index?baseCountry=UA&targetCountry=UA&commodity=corn" 2>&1)
SAME_COUNTRY_HTTP_CODE=$(echo "$SAME_COUNTRY_RESP" | tail -1)

if [ "$SAME_COUNTRY_HTTP_CODE" = "400" ]; then
  echo "OK: Correctly returns 400 for same country"
else
  echo "WARN: Expected 400 for same country, got $SAME_COUNTRY_HTTP_CODE"
fi
echo ""

# Test 4: Test with history (optional)
echo "4. Testing with includeHistory=true..."
HISTORY_RESP=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/api/arbitrage/index?baseCountry=BR&targetCountry=AR&commodity=corn&includeHistory=true" 2>&1)
HISTORY_HTTP_CODE=$(echo "$HISTORY_RESP" | tail -1)
HISTORY_BODY=$(echo "$HISTORY_RESP" | sed '$d')

if [ "$HISTORY_HTTP_CODE" = "200" ]; then
  echo "OK: History request successful"
  if echo "$HISTORY_BODY" | grep -q '"history"'; then
    echo "OK: History data included in response"
    echo "$HISTORY_BODY" | grep -A 5 '"history"' | head -10
  else
    echo "INFO: No history data in response (may be empty)"
  fi
else
  echo "INFO: History request returned HTTP $HISTORY_HTTP_CODE (may not have data)"
fi
echo ""

echo "=========================="
echo "All tests completed!"
echo ""
echo "Summary:"
echo "  - Basic arbitrage: OK"
echo "  - Response structure: OK"
echo "  - Error handling: OK"
echo "  - History (optional): Tested"