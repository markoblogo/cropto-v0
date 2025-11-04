# Cropto Partner Demo Script

Welcome to the Cropto platform demo! This guide will walk you through all key features including login, creating options, triggering margin calls, and submitting feedback.

## Prerequisites

- Access to the Cropto platform at `https://your-app.replit.app` (or `http://localhost:5000` for local development)
- A REST client like `curl`, Postman, or your browser
- Demo credentials (provided below)

## Demo User Credentials

Three demo users are pre-configured with different roles:

| Email          | Password | Role   | Description                              |
|----------------|----------|--------|------------------------------------------|
| farmer@demo    | pass     | farmer | Can create and manage options            |
| trader@demo    | pass     | trader | Can trade and exercise options           |
| broker@demo    | pass     | broker | Has admin access to all features         |

---

## 1. Login & Authentication

### Web UI Login

1. Navigate to the Cropto platform URL
2. Click **Login** or **Sign In**
3. Enter credentials:
   - **Email**: `farmer@demo`
   - **Password**: `pass`
4. Click **Login**
5. You should be redirected to the dashboard

### API Login (curl)

```bash
# Login as farmer
curl -X POST https://your-app.replit.app/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "farmer@demo",
    "password": "pass"
  }'
```

**Expected Response:**
```json
{
  "user": {
    "id": "user_xxxxx",
    "email": "farmer@demo",
    "role": "farmer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Save the token** - you'll need it for subsequent API calls:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 2. Run Demo Seed Script

The demo seed script creates sample users, options, and index prices for testing.

### Using npm script (recommended)

```bash
npm run seed:demo
```

**Expected Output:**
```
🌱 Starting demo data seeding...
📝 Creating demo users...
  ℹ️  User farmer@demo already exists, skipping
  ℹ️  User trader@demo already exists, skipping
  ℹ️  User broker@demo already exists, skipping
🧹 Cleaning existing demo data...
  🗑️  Deleted 3 existing demo options
  🗑️  Deleted 2 existing demo index prices
💰 Creating demo index prices...
  ✅ Created index price: WHEAT @ 210.00000000
  ✅ Created index price: WHEAT @ 240.00000000
📊 Creating demo options...
  ✅ Created option: WHEAT CALL Option - Strike 220 (Collateral: 1100.00000000)
  ✅ Created option: WHEAT PUT Option - Strike 200 (Collateral: 1500.00000000)
  ✅ Created option: WHEAT CALL Option - Strike 250 (Collateral: 937.50000000)
✨ Demo data seeding complete!
   Users: 3
   Options: 3
   Index Prices: 2
```

### Using direct node command

```bash
node --loader tsx server/scripts/seedDemo.ts
```

### What Gets Created

The seed script creates:

- ✅ **3 Demo Users** (if they don't exist)
  - farmer@demo, trader@demo, broker@demo
- ✅ **3 Demo Options**
  - WHEAT CALL @ Strike 220 (OPEN)
  - WHEAT PUT @ Strike 200 (FILLED)
  - WHEAT CALL @ Strike 250 (OPEN)
- ✅ **2 Index Prices**
  - WHEAT @ $210 (current)
  - WHEAT @ $240 (tomorrow)

**Note:** The seed script is **idempotent** - you can run it multiple times safely. It will:
- Skip users that already exist
- Delete and recreate demo options (marked with `isDemo='true'`)
- Delete and recreate demo index prices

---

## 3. Margin Call Scenario Walkthrough

This section demonstrates the complete margin call workflow from creating an option to triggering a margin call.

### Step 3.1: Login as Farmer

Login as the farmer user (option issuer):

```bash
curl -X POST https://your-app.replit.app/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "farmer@demo",
    "password": "pass"
  }'
```

Save the token:
```bash
export FARMER_TOKEN="<token-from-response>"
```

### Step 3.2: Create a New Option

Create a CALL option with strike price $220:

```bash
curl -X POST https://your-app.replit.app/api/options \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FARMER_TOKEN" \
  -d '{
    "title": "WHEAT CALL Demo - Margin Test",
    "type": "CALL",
    "strike": "220.00",
    "qty": "100.00",
    "premium": "15.00",
    "buyer": "farmer@demo",
    "commodity": "WHEAT",
    "collateralAmount": "1100.00"
  }'
```

**Expected Response:**
```json
{
  "id": "option_xxxxx",
  "title": "WHEAT CALL Demo - Margin Test",
  "type": "CALL",
  "strike": "220.00000000",
  "qty": "100.00000000",
  "premium": "15.00000000",
  "buyer": "farmer@demo",
  "status": "OPEN",
  "commodity": "WHEAT",
  "buyerId": "user_xxxxx",
  "issuerId": "user_xxxxx",
  "collateralAmount": "1100.00000000",
  "lastIntrinsic": "0.00000000",
  "payoutAccumulated": "0.00000000",
  "createdAt": "2025-11-04T..."
}
```

**Save the option ID:**
```bash
export OPTION_ID="option_xxxxx"
```

### Step 3.3: Run Margin Check with Index Price $240

Now trigger the margin check job with an index price of $240, which will create a margin call since the intrinsic value exceeds the collateral:

```bash
curl -X POST https://your-app.replit.app/api/jobs/run-margin-check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FARMER_TOKEN" \
  -d '{
    "indexPrice": 240,
    "commodity": "WHEAT"
  }'
```

**Expected Response:**
```json
{
  "marginCalls": [
    {
      "id": "margin_xxxxx",
      "optionId": "option_xxxxx",
      "userId": "user_xxxxx",
      "amountRequired": "900.00000000",
      "intrinsicValue": "2000.00000000",
      "collateralAmount": "1100.00000000",
      "reservedCollateral": "0.00000000",
      "status": "PENDING",
      "deadline": "2025-11-05T...",
      "createdAt": "2025-11-04T..."
    }
  ],
  "optionsProcessed": 3,
  "indexPrice": 240,
  "commodity": "WHEAT"
}
```

**What happened?**
- The margin check job processed all OPEN options with WHEAT commodity
- Created 1 margin call for the option we just created (intrinsic value exceeded collateral)
- Notifications were also created (view them in Step 3.7)

### Step 3.4: Understanding the Margin Call

**Why was a margin call triggered?**

For a CALL option:
- **Intrinsic Value** = `max(0, indexPrice - strike) × qty`
- **Intrinsic Value** = `max(0, 240 - 220) × 100` = **$2,000**
- **Collateral Posted** = **$1,100**
- **Margin Rule**: If `intrinsic > collateral × 1.2`, trigger margin call
- **Amount Required** = `intrinsic - collateral` = $2,000 - $1,100 = **$900**

The issuer (farmer) needs to top up an additional $900 to cover the increased risk.

### Step 3.5: View Margin Calls

Check all pending margin calls:

```bash
curl -X GET https://your-app.replit.app/api/margin-calls \
  -H "Authorization: Bearer $FARMER_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "margin_xxxxx",
    "optionId": "option_xxxxx",
    "userId": "user_xxxxx",
    "amountRequired": "900.00000000",
    "intrinsicValue": "2000.00000000",
    "collateralAmount": "1100.00000000",
    "reservedCollateral": "0.00000000",
    "status": "PENDING",
    "deadline": "2025-11-05T...",
    "createdAt": "2025-11-04T..."
  }
]
```

### Step 3.6: Top Up Margin Call (Optional)

Resolve the margin call by topping up collateral:

```bash
curl -X POST https://your-app.replit.app/api/margin-call/$MARGIN_CALL_ID/topup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FARMER_TOKEN" \
  -d '{
    "amount": "900.00"
  }'
```

**Expected Response:**
```json
{
  "marginCall": {
    "id": "margin_xxxxx",
    "optionId": "option_xxxxx",
    "userId": "user_xxxxx",
    "amountRequired": "900.00000000",
    "intrinsicValue": "2000.00000000",
    "collateralAmount": "1100.00000000",
    "reservedCollateral": "900.00000000",
    "status": "RESOLVED",
    "deadline": "2025-11-05T...",
    "createdAt": "2025-11-04T..."
  },
  "resolved": true,
  "totalAvailable": "2000.00000000",
  "amountRequired": "900.00000000"
}
```

**Note:** The `resolved` field indicates whether the margin call was successfully resolved by this top-up. `totalAvailable` shows the total collateral (original + reserved) now available.

### Step 3.7: View Notifications

Check in-app notifications:

```bash
curl -X GET https://your-app.replit.app/api/notifications \
  -H "Authorization: Bearer $FARMER_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "notif_xxxxx",
    "userId": "user_xxxxx",
    "type": "MARGIN_CALL",
    "message": "Margin call triggered for option WHEAT CALL Demo - Margin Test. Amount required: 900.00000000",
    "relatedId": "margin_xxxxx",
    "read": "false",
    "createdAt": "2025-11-04T..."
  }
]
```

---

## 4. Other Key Features

### Create an Option (Web UI)

1. Login as `farmer@demo`
2. Navigate to **Dashboard**
3. Click **Create New Option**
4. Fill in the form:
   - **Title**: "My Test Option"
   - **Type**: CALL
   - **Strike Price**: 220
   - **Quantity**: 100
   - **Premium**: 15
   - **Buyer**: farmer@demo
   - **Commodity**: WHEAT
5. Click **Create Option**

### Match an Option

```bash
curl -X POST https://your-app.replit.app/api/options/$OPTION_ID/match \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "seller": "trader@demo"
  }'
```

### Exercise an Option

```bash
curl -X POST https://your-app.replit.app/api/options/$OPTION_ID/exercise \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "exercisedBy": "farmer@demo",
    "spotPrice": "250.00"
  }'
```

---

## 5. Submit Feedback

Partners can submit feedback about UI/UX issues or suggestions.

### Web UI Feedback

1. Navigate to `/feedback` (no login required)
2. Fill in the form:
   - **Name**: Your name
   - **Email**: your.email@company.com
   - **Role**: Select your role (Farmer, Trader, Broker, Partner, Other)
   - **Message**: Describe your feedback
   - **Screenshot URL** (optional): Link to screenshot
3. Click **Submit Feedback**

### API Feedback Submission

```bash
curl -X POST https://your-app.replit.app/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Partner",
    "email": "jane@partner-company.com",
    "role": "Partner",
    "message": "The margin call notification is very helpful! Suggestion: add email alerts in addition to in-app notifications.",
    "screenshotUrl": "https://example.com/screenshot.png"
  }'
```

**Expected Response:**
```json
{
  "id": "feedback_xxxxx",
  "name": "Jane Partner",
  "email": "jane@partner-company.com",
  "role": "Partner",
  "message": "The margin call notification is very helpful! Suggestion: add email alerts in addition to in-app notifications.",
  "screenshotUrl": "https://example.com/screenshot.png",
  "status": "open",
  "createdAt": "2025-11-04T..."
}
```

### View Feedback (Admin Only)

Login as `broker@demo` (admin role) to view all feedback:

1. Login as `broker@demo`
2. Navigate to `/admin/feedback`
3. View all submitted feedback
4. Mark feedback as resolved
5. Export feedback as CSV

**API - View All Feedback:**
```bash
curl -X GET https://your-app.replit.app/api/admin/feedback \
  -H "Authorization: Bearer $BROKER_TOKEN"
```

---

## 6. Quick Testing Checklist

Use this checklist to verify all key features:

- [ ] **Authentication**
  - [ ] Login as farmer@demo
  - [ ] Login as trader@demo
  - [ ] Login as broker@demo
  - [ ] Logout works correctly

- [ ] **Demo Seed**
  - [ ] Run `npm run seed:demo`
  - [ ] Verify 3 options created
  - [ ] Verify 2 index prices created

- [ ] **Options Management**
  - [ ] Create new option via UI
  - [ ] Create new option via API
  - [ ] View options list
  - [ ] Filter options by type (CALL/PUT)
  - [ ] Filter options by status (OPEN/FILLED/EXPIRED)

- [ ] **Margin Call Workflow**
  - [ ] Create option with collateral
  - [ ] Run margin check with index price 240
  - [ ] Verify margin call created
  - [ ] Verify notification created
  - [ ] Top up margin call
  - [ ] Verify margin call status changes to RESOLVED

- [ ] **Notifications**
  - [ ] View unread notifications
  - [ ] Mark notification as read
  - [ ] Click notification to navigate to related option

- [ ] **Feedback System**
  - [ ] Submit feedback as public user (no login)
  - [ ] View feedback as broker (admin)
  - [ ] Resolve feedback
  - [ ] Export feedback as CSV

- [ ] **Admin Features (broker@demo)**
  - [ ] Access admin feedback dashboard
  - [ ] Force settle options
  - [ ] Process expired margin call deadlines

---

## 7. Common Issues & Troubleshooting

### Issue: "Invalid credentials" when logging in

**Solution:** Verify you're using the correct credentials:
- Email: `farmer@demo` (not `farmer` or `demo@farmer`)
- Password: `pass` (all lowercase)

### Issue: "Option not found" when running margin check

**Solution:** Ensure the option exists and is in OPEN status:
```bash
curl -X GET https://your-app.replit.app/api/options \
  -H "Authorization: Bearer $TOKEN"
```

### Issue: Margin call not triggered with index price 240

**Solution:** Verify:
1. Option has `collateralAmount` set
2. Option status is "OPEN"
3. Index price calculation: For CALL, intrinsic = `(240 - strike) × qty`
4. Margin rule: intrinsic > collateral × 1.2

### Issue: 401 Unauthorized on API calls

**Solution:** Ensure you're passing the Bearer token correctly:
```bash
-H "Authorization: Bearer $TOKEN"
```

### Issue: Seed script fails with database error

**Solution:** Verify database connection:
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Try pushing schema
npm run db:push
```

---

## 8. Expected Demo Flow Summary

Here's the recommended flow for a complete demo:

1. **Setup** (2 min)
   - Run demo seed script
   - Login as farmer@demo

2. **Create Option** (3 min)
   - Create WHEAT CALL option with strike 220, qty 100
   - Note the collateral: $1,100

3. **Trigger Margin Call** (2 min)
   - Run margin check with index price 240
   - Observe intrinsic value: $2,000
   - Observe margin call created: Amount required $900

4. **Review Notifications** (1 min)
   - Check in-app notifications
   - See margin call alert

5. **Resolve Margin Call** (2 min)
   - Top up with $900
   - Verify status changes to RESOLVED

6. **Submit Feedback** (1 min)
   - Navigate to /feedback
   - Submit test feedback

**Total Time:** ~10-15 minutes

---

## 9. API Quick Reference

| Endpoint                           | Method | Auth Required | Description                    |
|------------------------------------|--------|---------------|--------------------------------|
| `/api/login`                       | POST   | No            | Authenticate user              |
| `/api/register`                    | POST   | No            | Register new user              |
| `/api/options`                     | GET    | Yes           | List all options               |
| `/api/options`                     | POST   | Yes           | Create new option              |
| `/api/options/:id/match`           | POST   | Yes           | Match option with seller       |
| `/api/options/:id/exercise`        | POST   | Yes           | Exercise filled option         |
| `/api/jobs/run-margin-check`       | POST   | Yes           | Run margin check job           |
| `/api/margin-calls`                | GET    | Yes           | List margin calls              |
| `/api/margin-call/:id/topup`       | POST   | Yes           | Top up margin call             |
| `/api/notifications`               | GET    | Yes           | List notifications             |
| `/api/notifications/:id/mark-read` | POST   | Yes           | Mark notification as read      |
| `/api/feedback`                    | POST   | No            | Submit feedback                |
| `/api/admin/feedback`              | GET    | Yes (broker)  | View all feedback (admin only) |

---

## Support

If you encounter any issues during the demo, please:

1. Check the troubleshooting section above
2. Submit feedback via `/feedback` with details about the issue
3. Contact the development team at support@cropto.io

---

**Happy Testing! 🚀**
