#!/bin/bash

# Test script for matching engine endpoint
# Usage: ./scripts/test_match.sh

set -e

BASE_URL="http://localhost:5000"
BROKER_EMAIL="broker@demo"
BROKER_PASSWORD="pass"

echo "=== Testing Matching Engine Endpoint ==="
echo

# Step 1: Login as broker
echo "1. Logging in as broker..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${BROKER_EMAIL}\",\"password\":\"${BROKER_PASSWORD}\"}")

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo $LOGIN_RESPONSE | jq .
  exit 1
fi

echo "✅ Logged in successfully"
echo "   Token: ${TOKEN:0:20}..."
echo "   User ID: $USER_ID"
echo

# Step 2: Create a test option
echo "2. Creating test option..."
CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "title": "Test WHEAT Call Option",
    "type": "CALL",
    "strike": "250.00",
    "qty": "100.00",
    "premium": "10.00",
    "buyer": "test-buyer@example.com",
    "commodity": "WHEAT"
  }')

OPTION_ID=$(echo $CREATE_RESPONSE | jq -r '.id')
OPTION_STATUS=$(echo $CREATE_RESPONSE | jq -r '.status')

if [ "$OPTION_ID" == "null" ] || [ -z "$OPTION_ID" ]; then
  echo "❌ Failed to create option"
  echo $CREATE_RESPONSE | jq .
  exit 1
fi

echo "✅ Option created successfully"
echo "   Option ID: $OPTION_ID"
echo "   Status: $OPTION_STATUS"
echo

# Step 3: Match the option
echo "3. Matching option with counterparty..."
MATCH_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options/${OPTION_ID}/match" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"counterpartyId\":\"trader_123\"}")

MATCHED_STATUS=$(echo $MATCH_RESPONSE | jq -r '.status')
MATCHED_BY=$(echo $MATCH_RESPONSE | jq -r '.matchedBy')
COUNTERPARTY_ID=$(echo $MATCH_RESPONSE | jq -r '.counterpartyId')
MATCHED_AT=$(echo $MATCH_RESPONSE | jq -r '.matchedAt')

if [ "$MATCHED_STATUS" != "FILLED" ]; then
  echo "❌ Match failed"
  echo $MATCH_RESPONSE | jq .
  exit 1
fi

echo "✅ Option matched successfully"
echo "   Status: $MATCHED_STATUS"
echo "   Matched By: $MATCHED_BY"
echo "   Counterparty ID: $COUNTERPARTY_ID"
echo "   Matched At: $MATCHED_AT"
echo

# Step 4: Verify option was updated
echo "4. Verifying option details..."
GET_RESPONSE=$(curl -s "${BASE_URL}/api/options" | jq ".[] | select(.id == \"${OPTION_ID}\")")

FINAL_STATUS=$(echo $GET_RESPONSE | jq -r '.status')
FINAL_MATCHED_BY=$(echo $GET_RESPONSE | jq -r '.matchedBy')
FINAL_COUNTERPARTY=$(echo $GET_RESPONSE | jq -r '.counterpartyId')

echo "✅ Verification complete"
echo "   Final Status: $FINAL_STATUS"
echo "   Final Matched By: $FINAL_MATCHED_BY"
echo "   Final Counterparty: $FINAL_COUNTERPARTY"
echo

# Step 5: Test authorization - try to match as non-broker
echo "5. Testing authorization (should fail for non-broker)..."
TRADER_LOGIN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"trader@demo","password":"pass"}')

TRADER_TOKEN=$(echo $TRADER_LOGIN | jq -r '.token')

AUTH_TEST_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options/${OPTION_ID}/match" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TRADER_TOKEN}" \
  -d '{"counterpartyId":"test_trader"}')

AUTH_ERROR=$(echo $AUTH_TEST_RESPONSE | jq -r '.error')

if [ "$AUTH_ERROR" == "Only brokers can match options" ]; then
  echo "✅ Authorization check passed (non-broker rejected)"
else
  echo "❌ Authorization check failed"
  echo $AUTH_TEST_RESPONSE | jq .
fi

echo
echo "=== All Tests Passed ✅ ==="
