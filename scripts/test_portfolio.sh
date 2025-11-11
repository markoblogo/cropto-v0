#!/bin/bash

BASE_URL="${BASE_URL:-http://localhost:5000}"

echo "=== Testing Portfolio API (/api/portfolio/me) ==="
echo ""

# 1. Login as broker to get token
echo "1. Logging in as broker..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "broker@demo",
    "password": "pass"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Login failed"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Logged in successfully"
echo "   Token: ${TOKEN:0:20}..."
echo ""

# 2. Fetch portfolio data
echo "2. Fetching portfolio data..."
PORTFOLIO_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/portfolio/me" \
  -H "Authorization: Bearer $TOKEN")

echo "$PORTFOLIO_RESPONSE" | jq '.'

# 3. Validate response structure
echo ""
echo "3. Validating response structure..."

# Check for required fields
TOTAL_PNL=$(echo $PORTFOLIO_RESPONSE | jq -r '.totalPnL')
REALIZED_PNL=$(echo $PORTFOLIO_RESPONSE | jq -r '.realizedPnL')
UNREALIZED_PNL=$(echo $PORTFOLIO_RESPONSE | jq -r '.unrealizedPnL')
LOCKED_COLLATERAL=$(echo $PORTFOLIO_RESPONSE | jq -r '.lockedCollateral')
OPEN_POSITIONS=$(echo $PORTFOLIO_RESPONSE | jq -r '.openPositions')
MARGIN_CALLS=$(echo $PORTFOLIO_RESPONSE | jq -r '.marginCalls')
POSITIONS=$(echo $PORTFOLIO_RESPONSE | jq -r '.positions')

# Validate totalPnL is numeric
if [[ ! "$TOTAL_PNL" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
  echo "❌ totalPnL is not a valid number: $TOTAL_PNL"
  exit 1
fi
echo "✅ totalPnL: $TOTAL_PNL"

# Validate realizedPnL is numeric
if [[ ! "$REALIZED_PNL" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
  echo "❌ realizedPnL is not a valid number: $REALIZED_PNL"
  exit 1
fi
echo "✅ realizedPnL: $REALIZED_PNL"

# Validate unrealizedPnL is numeric
if [[ ! "$UNREALIZED_PNL" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
  echo "❌ unrealizedPnL is not a valid number: $UNREALIZED_PNL"
  exit 1
fi
echo "✅ unrealizedPnL: $UNREALIZED_PNL"

# Validate lockedCollateral is numeric
if [[ ! "$LOCKED_COLLATERAL" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
  echo "❌ lockedCollateral is not a valid number: $LOCKED_COLLATERAL"
  exit 1
fi
echo "✅ lockedCollateral: $LOCKED_COLLATERAL"

# Validate openPositions is integer
if [[ ! "$OPEN_POSITIONS" =~ ^[0-9]+$ ]]; then
  echo "❌ openPositions is not a valid integer: $OPEN_POSITIONS"
  exit 1
fi
echo "✅ openPositions: $OPEN_POSITIONS"

# Validate marginCalls is integer  
if [[ ! "$MARGIN_CALLS" =~ ^[0-9]+$ ]]; then
  echo "❌ marginCalls is not a valid integer: $MARGIN_CALLS"
  exit 1
fi
echo "✅ marginCalls: $MARGIN_CALLS"

# Validate positions is array
if [ "$POSITIONS" = "null" ]; then
  echo "❌ positions is null"
  exit 1
fi
echo "✅ positions: array with $(echo $PORTFOLIO_RESPONSE | jq '.positions | length') items"

# 4. Test unauthenticated access (should fail)
echo ""
echo "4. Testing unauthenticated access (should fail)..."
UNAUTH_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/portfolio/me")

if echo "$UNAUTH_RESPONSE" | grep -qi "Authentication required\|Unauthorized\|Access token required"; then
  echo "✅ Unauthenticated access properly rejected"
else
  echo "❌ Unauthenticated access was not rejected"
  echo "Response: $UNAUTH_RESPONSE"
  exit 1
fi

echo ""
echo "=== All Portfolio API Tests Passed ✅ ==="
