#!/bin/bash

# Test script for polling system
# Tests that /api/health-updates returns updated options after matching

set -e

API_URL="${API_URL:-http://localhost:5000}"
BROKER_EMAIL="${BROKER_EMAIL:-broker@cropto.com}"
BROKER_PASSWORD="${BROKER_PASSWORD:-password123}"
TRADER_EMAIL="${TRADER_EMAIL:-trader@cropto.com}"

echo "========================================="
echo "Testing Polling System"
echo "========================================="
echo ""

# Login as broker
echo "1. Logging in as broker..."
BROKER_TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$BROKER_EMAIL\",\"password\":\"$BROKER_PASSWORD\"}" \
  | jq -r '.token')

if [ -z "$BROKER_TOKEN" ] || [ "$BROKER_TOKEN" = "null" ]; then
  echo "❌ Failed to login as broker"
  exit 1
fi
echo "✓ Broker logged in"

# Get current timestamp for cursor
CURSOR=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
echo "✓ Starting cursor: $CURSOR"
echo ""

# Create a new option
echo "2. Creating new option as broker..."
OPTION_ID=$(curl -s -X POST "$API_URL/api/options" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BROKER_TOKEN" \
  -d '{
    "title": "WHEAT-CALL-250-2025-12-31-POLLING-TEST",
    "type": "CALL",
    "strike": "250",
    "qty": "100",
    "premium": "5.00",
    "expiryDate": "2025-12-31",
    "collateralAmount": "500.00"
  }' | jq -r '.id')

if [ -z "$OPTION_ID" ] || [ "$OPTION_ID" = "null" ]; then
  echo "❌ Failed to create option"
  exit 1
fi
echo "✓ Created option: $OPTION_ID"

# Wait a moment for timestamp to update
sleep 2

# Match the option
echo ""
echo "3. Matching option with counterparty..."
MATCH_RESPONSE=$(curl -s -X POST "$API_URL/api/options/$OPTION_ID/match" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BROKER_TOKEN" \
  -d "{\"counterpartyId\":\"$TRADER_EMAIL\"}")

if echo "$MATCH_RESPONSE" | jq -e '.error' > /dev/null; then
  echo "❌ Failed to match option"
  echo "$MATCH_RESPONSE" | jq '.'
  exit 1
fi
echo "✓ Option matched"

# Wait for lastUpdated to be set
sleep 1

# Query health-updates endpoint
echo ""
echo "4. Querying /api/health-updates with cursor..."
UPDATES=$(curl -s -X GET "$API_URL/api/health-updates?since=$CURSOR" \
  -H "Authorization: Bearer $BROKER_TOKEN")

echo "$UPDATES" | jq '.'

# Check if our option is in the updates
FOUND=$(echo "$UPDATES" | jq -r ".options[] | select(.id == \"$OPTION_ID\") | .id")

if [ -z "$FOUND" ] || [ "$FOUND" = "null" ]; then
  echo ""
  echo "❌ Option not found in health updates"
  echo "Expected option ID: $OPTION_ID"
  echo "Options in response:"
  echo "$UPDATES" | jq -r '.options[].id'
  exit 1
fi

echo ""
echo "✓ Option found in health updates!"

# Verify status is FILLED
STATUS=$(echo "$UPDATES" | jq -r ".options[] | select(.id == \"$OPTION_ID\") | .status")
if [ "$STATUS" != "FILLED" ]; then
  echo "❌ Expected status FILLED, got: $STATUS"
  exit 1
fi
echo "✓ Option status is FILLED"

# Verify matchedBy is set
MATCHED_BY=$(echo "$UPDATES" | jq -r ".options[] | select(.id == \"$OPTION_ID\") | .matchedBy")
if [ -z "$MATCHED_BY" ] || [ "$MATCHED_BY" = "null" ]; then
  echo "❌ matchedBy not set"
  exit 1
fi
echo "✓ matchedBy is set: $MATCHED_BY"

echo ""
echo "========================================="
echo "✅ All Polling Tests Passed!"
echo "========================================="
echo ""
echo "Summary:"
echo "  - Created option: $OPTION_ID"
echo "  - Matched with: $TRADER_EMAIL"
echo "  - Health updates returned updated option"
echo "  - Status correctly shows FILLED"
echo "  - Polling system working correctly"
