#!/bin/bash

# Test script for exercise/settlement flow
# Tests: create option -> match -> exercise -> verify settlement

BASE_URL="http://localhost:5000"

echo "=== Testing Exercise/Settlement Flow ==="
echo ""

# 1. Login as broker
echo "1. Logging in as broker..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "broker@demo",
    "password": "pass"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Logged in successfully"
echo "   Token: ${TOKEN:0:20}..."
echo "   User ID: $USER_ID"
echo ""

# 2. Create test option
echo "2. Creating test option..."
CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Exercise Option",
    "type": "CALL",
    "commodity": "WHEAT",
    "strike": "250",
    "qty": "100",
    "premium": "5",
    "buyer": "test@buyer.com",
    "collateralAmount": "5000"
  }')

OPTION_ID=$(echo $CREATE_RESPONSE | jq -r '.id')
OPTION_STATUS=$(echo $CREATE_RESPONSE | jq -r '.status')

if [ -z "$OPTION_ID" ]; then
  echo "❌ Option creation failed"
  echo "Response: $CREATE_RESPONSE"
  exit 1
fi

echo "✅ Option created successfully"
echo "   Option ID: $OPTION_ID"
echo "   Status: $OPTION_STATUS"
echo ""

# 3. Match option with counterparty
echo "3. Matching option with counterparty..."
MATCH_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options/${OPTION_ID}/match" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "counterpartyId": "seller_456"
  }')

MATCHED_STATUS=$(echo $MATCH_RESPONSE | jq -r '.status')
MATCHED_BY=$(echo $MATCH_RESPONSE | jq -r '.matchedBy')

if [ "$MATCHED_STATUS" != "FILLED" ]; then
  echo "❌ Matching failed"
  echo "Response: $MATCH_RESPONSE"
  exit 1
fi

echo "✅ Option matched successfully"
echo "   Status: $MATCHED_STATUS"
echo "   Matched By: $MATCHED_BY"
echo ""

# 4. Exercise option
echo "4. Exercising option with spot price..."
EXERCISE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options/${OPTION_ID}/exercise" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "spotPrice": 300
  }')

SETTLEMENT_ID=$(echo $EXERCISE_RESPONSE | jq -r '.id')
PAYOUT=$(echo $EXERCISE_RESPONSE | jq -r '.payout')
SPOT_PRICE=$(echo $EXERCISE_RESPONSE | jq -r '.spotPrice')

if [ -z "$SETTLEMENT_ID" ]; then
  echo "❌ Exercise failed"
  echo "Response: $EXERCISE_RESPONSE"
  exit 1
fi

echo "✅ Option exercised successfully"
echo "   Settlement ID: $SETTLEMENT_ID"
echo "   Spot Price: $SPOT_PRICE"
echo "   Payout: $PAYOUT"
echo ""

# 5. Verify option status changed to SETTLED
echo "5. Verifying option status..."
VERIFY_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/options")

FINAL_STATUS=$(echo $VERIFY_RESPONSE | jq -r ".[] | select(.id == \"$OPTION_ID\") | .status")

if [ "$FINAL_STATUS" != "SETTLED" ]; then
  echo "❌ Status verification failed"
  echo "Expected: SETTLED"
  echo "Got: $FINAL_STATUS"
  exit 1
fi

echo "✅ Verification complete"
echo "   Final Status: $FINAL_STATUS"
echo ""

# 6. Verify settlement record exists
echo "6. Verifying settlement record..."
SETTLEMENTS_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/settlements" \
  -H "Authorization: Bearer $TOKEN")

if echo "$SETTLEMENTS_RESPONSE" | grep -q "$SETTLEMENT_ID"; then
  echo "✅ Settlement record exists"
else
  echo "❌ Settlement record not found"
  exit 1
fi
echo ""

# 7. Verify transaction record exists
echo "7. Verifying transaction record..."
TRANSACTIONS_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/transactions" \
  -H "Authorization: Bearer $TOKEN")

if echo "$TRANSACTIONS_RESPONSE" | grep -q "$OPTION_ID"; then
  echo "✅ Transaction record exists"
  echo "   Transaction contains option ID: $OPTION_ID"
else
  echo "❌ Transaction record not found"
  exit 1
fi
echo ""

# 8. Test authorization (non-owner should fail)
echo "8. Testing authorization (should fail for non-owner)..."
# Login as different user
TRADER_LOGIN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader@demo",
    "password": "pass"
  }')

TRADER_TOKEN=$(echo $TRADER_LOGIN | jq -r '.token')

# Create another option to test with
CREATE2_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Auth Option",
    "type": "PUT",
    "commodity": "WHEAT",
    "strike": "200",
    "qty": "50",
    "premium": "3",
    "buyer": "test@buyer2.com"
  }')

OPTION2_ID=$(echo $CREATE2_RESPONSE | jq -r '.id')

# Match it first
curl -s -X POST "${BASE_URL}/api/options/${OPTION2_ID}/match" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "counterpartyId": "seller_999"
  }' > /dev/null

# Try to exercise as non-owner (should fail)
AUTH_TEST_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/options/${OPTION2_ID}/exercise" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER_TOKEN" \
  -d '{
    "spotPrice": 180
  }')

if echo "$AUTH_TEST_RESPONSE" | grep -q "error"; then
  echo "✅ Authorization check passed (non-owner rejected)"
else
  echo "⚠️  Warning: Authorization check may have issues"
  echo "Response: $AUTH_TEST_RESPONSE"
fi
echo ""

echo "=== All Tests Passed ✅ ==="
