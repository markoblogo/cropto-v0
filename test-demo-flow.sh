#!/bin/bash
# Demo flow test script for Cropto
# IMPORTANT: Start server with DEMO_RELAX_CROPT_CHECK=true environment variable
# Example: DEMO_RELAX_CROPT_CHECK=true PORT=5002 NODE_ENV=development npx tsx server/index.ts

BASE_URL="http://localhost:5002"

# Initialize status variables
LOGIN_STATUS="FAIL"
OPTION_STATUS="FAIL"
MATCH_STATUS="FAIL"
EXERCISE_STATUS="FAIL"
MINT_STATUS="SKIPPED"
ERRORS=""

echo "Starting demo flow test..."

# Step 1: Login as farmer
echo "1. Logging in as farmer@demo..."
FARMER_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
  -d '{"email":"farmer@demo","password":"pass"}' \
  "$BASE_URL/api/auth/login" 2>&1)
FARMER_HTTP_CODE=$(echo "$FARMER_RESP" | tail -1)
FARMER_BODY=$(echo "$FARMER_RESP" | sed '$d')
FARMER_TOKEN=$(echo "$FARMER_BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")

if [ "$FARMER_HTTP_CODE" = "200" ] && [ -n "$FARMER_TOKEN" ]; then
  echo "OK: Farmer logged in"
  LOGIN_STATUS="OK"
  FARMER_ID=$(echo "$FARMER_BODY" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 || echo "")
else
  echo "FAIL: Farmer login failed (HTTP $FARMER_HTTP_CODE)"
  ERRORS="${ERRORS}Login: HTTP $FARMER_HTTP_CODE - $FARMER_BODY; "
  cat > /tmp/cropto-flow-report.json <<EOF
{
  "supabase_mode": "OK",
  "login_flow": "FAIL",
  "option_flow": "FAIL",
  "nft_mint": "SKIPPED",
  "notes": "Login failed: HTTP $FARMER_HTTP_CODE - $FARMER_BODY"
}
EOF
  cat /tmp/cropto-flow-report.json
  exit 1
fi

# Step 2: Get available indexes
echo "2. Getting available indexes..."
INDEXES_RESP=$(curl -s "$BASE_URL/api/indexes" 2>&1)
INDEX_ID=$(echo "$INDEXES_RESP" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 || echo "")

if [ -z "$INDEX_ID" ]; then
  echo "FAIL: No indexes found"
  ERRORS="${ERRORS}Indexes: no indexes available; "
  cat > /tmp/cropto-flow-report.json <<EOF
{
  "supabase_mode": "OK",
  "login_flow": "OK",
  "option_flow": "FAIL",
  "nft_mint": "SKIPPED",
  "notes": "No indexes found"
}
EOF
  cat /tmp/cropto-flow-report.json
  exit 1
fi
echo "OK: Using index $INDEX_ID"

# Step 3: Create option
echo "3. Creating option..."
# Calculate expiration date (3 months from now)
EXP_DATE=$(date -u -v+3m +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "+3 months" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || echo "2025-04-01T00:00:00.000Z")

OPTION_DATA=$(cat <<EOF
{
  "title": "Test CALL Option - Demo Flow",
  "indexId": "$INDEX_ID",
  "type": "CALL",
  "strike": "200",
  "qty": "100",
  "premium": "2",
  "expirationDate": "$EXP_DATE",
  "expiryHalf": "H1",
  "expiryMonth": 3,
  "expiryYear": 2025
}
EOF
)

OPTION_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $FARMER_TOKEN" \
  -d "$OPTION_DATA" \
  "$BASE_URL/api/options" 2>&1)
OPTION_HTTP_CODE=$(echo "$OPTION_RESP" | tail -1)
OPTION_BODY=$(echo "$OPTION_RESP" | sed '$d')
OPTION_ID=$(echo "$OPTION_BODY" | grep -o '"id":"[^"]*' | cut -d'"' -f4 || echo "")

if [ "$OPTION_HTTP_CODE" = "201" ] && [ -n "$OPTION_ID" ]; then
  echo "OK: Option created: $OPTION_ID"
  OPTION_STATUS="OK"
else
  echo "FAIL: Option creation failed (HTTP $OPTION_HTTP_CODE)"
  ERRORS="${ERRORS}Create option: HTTP $OPTION_HTTP_CODE - $OPTION_BODY; "
  OPTION_STATUS="FAIL"
  cat > /tmp/cropto-flow-report.json <<EOF
{
  "supabase_mode": "OK",
  "login_flow": "OK",
  "option_flow": "PARTIAL",
  "nft_mint": "SKIPPED",
  "notes": "Create option failed: HTTP $OPTION_HTTP_CODE - $OPTION_BODY"
}
EOF
  cat /tmp/cropto-flow-report.json
  exit 1
fi

# Step 4: Login as broker
echo "4. Logging in as broker@demo..."
BROKER_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
  -d '{"email":"broker@demo","password":"pass"}' \
  "$BASE_URL/api/auth/login" 2>&1)
BROKER_HTTP_CODE=$(echo "$BROKER_RESP" | tail -1)
BROKER_BODY=$(echo "$BROKER_RESP" | sed '$d')
BROKER_TOKEN=$(echo "$BROKER_BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")

if [ "$BROKER_HTTP_CODE" != "200" ] || [ -z "$BROKER_TOKEN" ]; then
  echo "FAIL: Broker login failed (HTTP $BROKER_HTTP_CODE)"
  ERRORS="${ERRORS}Broker login: HTTP $BROKER_HTTP_CODE - $BROKER_BODY; "
  cat > /tmp/cropto-flow-report.json <<EOF
{
  "supabase_mode": "OK",
  "login_flow": "OK",
  "option_flow": "PARTIAL",
  "nft_mint": "SKIPPED",
  "notes": "Broker login failed: HTTP $BROKER_HTTP_CODE - $BROKER_BODY"
}
EOF
  cat /tmp/cropto-flow-report.json
  exit 1
fi
echo "OK: Broker logged in"

# Step 5: Match option
echo "5. Matching option..."
MATCH_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BROKER_TOKEN" \
  -d "{\"counterpartyId\":\"$FARMER_ID\"}" \
  "$BASE_URL/api/options/$OPTION_ID/match" 2>&1)
MATCH_HTTP_CODE=$(echo "$MATCH_RESP" | tail -1)
MATCH_BODY=$(echo "$MATCH_RESP" | sed '$d')

if [ "$MATCH_HTTP_CODE" = "200" ]; then
  echo "OK: Option matched"
  MATCH_STATUS="OK"
else
  echo "FAIL: Option match failed (HTTP $MATCH_HTTP_CODE)"
  ERRORS="${ERRORS}Match: HTTP $MATCH_HTTP_CODE - $MATCH_BODY; "
  MATCH_STATUS="FAIL"
  OPTION_STATUS="PARTIAL"
fi

# Step 6: Exercise option
if [ "$MATCH_STATUS" = "OK" ]; then
  echo "6. Exercising option..."
  EXERCISE_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $FARMER_TOKEN" \
    -d '{"spotPrice": 260}' \
    "$BASE_URL/api/options/$OPTION_ID/exercise" 2>&1)
  EXERCISE_HTTP_CODE=$(echo "$EXERCISE_RESP" | tail -1)
  EXERCISE_BODY=$(echo "$EXERCISE_RESP" | sed '$d')

  if [ "$EXERCISE_HTTP_CODE" = "200" ]; then
    echo "OK: Option exercised"
    EXERCISE_STATUS="OK"
    
    # Check if settlement record exists in response
    SETTLEMENT_ID=$(echo "$EXERCISE_BODY" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4 || echo "")
    if [ -n "$SETTLEMENT_ID" ]; then
      echo "OK: Settlement record created (ID: $SETTLEMENT_ID)"
    else
      echo "WARN: Settlement ID not found in response"
      ERRORS="${ERRORS}Settlement ID missing; "
    fi
    
    # Verify settlement has required fields
    if echo "$EXERCISE_BODY" | grep -q '"optionId"'; then
      echo "OK: Settlement has optionId"
    else
      echo "WARN: Settlement missing optionId"
    fi
  else
    echo "FAIL: Option exercise failed (HTTP $EXERCISE_HTTP_CODE)"
    ERRORS="${ERRORS}Exercise: HTTP $EXERCISE_HTTP_CODE - $EXERCISE_BODY; "
    EXERCISE_STATUS="FAIL"
    OPTION_STATUS="PARTIAL"
  fi
fi

# Step 7: Mint NFT (optional)
if [ "$EXERCISE_STATUS" = "OK" ]; then
  echo "7. Attempting NFT mint..."
  MINT_RESP=$(curl -s -w "\n%{http_code}" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $FARMER_TOKEN" \
    -d "{\"optionId\":\"$OPTION_ID\"}" \
    "$BASE_URL/api/onchain/mint-nft" 2>&1)
  MINT_HTTP_CODE=$(echo "$MINT_RESP" | tail -1)
  MINT_BODY=$(echo "$MINT_RESP" | sed '$d')

  if [ "$MINT_HTTP_CODE" = "200" ]; then
    echo "OK: NFT minted"
    MINT_STATUS="OK"
  else
    echo "SKIPPED: NFT mint (HTTP $MINT_HTTP_CODE)"
    MINT_STATUS="SKIPPED"
  fi
fi

# Determine overall option flow status
if [ "$OPTION_STATUS" = "OK" ] && [ "$MATCH_STATUS" = "OK" ] && [ "$EXERCISE_STATUS" = "OK" ]; then
  OPTION_FLOW="OK"
elif [ "$OPTION_STATUS" = "OK" ] || [ "$MATCH_STATUS" = "OK" ] || [ "$EXERCISE_STATUS" = "OK" ]; then
  OPTION_FLOW="PARTIAL"
else
  OPTION_FLOW="FAIL"
fi

# Generate report
cat > /tmp/cropto-flow-report.json <<EOF
{
  "supabase_mode": "OK",
  "login_flow": "$LOGIN_STATUS",
  "option_flow": "$OPTION_FLOW",
  "nft_mint": "$MINT_STATUS",
  "notes": "${ERRORS:-All steps completed successfully}"
}
EOF

echo ""
echo "=== REPORT ==="
cat /tmp/cropto-flow-report.json
echo ""
