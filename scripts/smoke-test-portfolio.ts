/**
 * Smoke test for Portfolio page
 * 
 * This script:
 * 1. Gets current Wheat 11.5% price
 * 2. Creates an in-the-money CALL option
 * 3. Updates price to make it clearly in-the-money
 * 4. Verifies Portfolio data
 */

import { db } from "../server/db";
import { indexes, commodityIndexPrices, options } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { storage } from "../server/storage";

const API_BASE = process.env.API_BASE || "http://localhost:5000";

// Test user credentials (adjust as needed)
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "test@example.com";
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "test123";

async function getAuthToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      }),
    });

    if (!response.ok) {
      console.error("❌ Login failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("❌ Login error:", error);
    return null;
  }
}

async function getCurrentWheatPrice(): Promise<{ price: number; indexId: string } | null> {
  try {
    // Find Wheat 11.5% index (canonical slug wheat-115)
    const [wheatIndex] = await db
      .select()
      .from(indexes)
      .where(eq(indexes.slug, "wheat-115"))
      .limit(1);

    if (!wheatIndex) {
      console.error("❌ Wheat 11.5% index not found");
      return null;
    }

    // Get latest price
    const [latestPrice] = await db
      .select()
      .from(commodityIndexPrices)
      .where(eq(commodityIndexPrices.indexId, wheatIndex.id))
      .orderBy(desc(commodityIndexPrices.timestamp))
      .limit(1);

    if (!latestPrice) {
      console.error("❌ No price found for Wheat 11.5%");
      return null;
    }

    return {
      price: parseFloat(latestPrice.price),
      indexId: wheatIndex.id,
    };
  } catch (error) {
    console.error("❌ Error getting Wheat 11.5% price:", error);
    return null;
  }
}

async function updateWheatPrice(token: string, newPrice: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/indexes/wheat-115/price`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        price: newPrice,
        delta: null,
      }),
    });

    if (!response.ok) {
      console.error("❌ Failed to update price:", await response.text());
      return false;
    }

    console.log(`✅ Updated Wheat 11.5% price to $${newPrice}/ton`);
    return true;
  } catch (error) {
    console.error("❌ Error updating price:", error);
    return false;
  }
}

async function createTestOption(
  token: string,
  indexId: string,
  strike: number,
  currentPrice: number
): Promise<string | null> {
  try {
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 3); // 3 months from now

    const optionData = {
      title: `Wheat 11.5% CALL Option - Strike ${strike} (Test)`,
      type: "CALL" as const,
      strike: strike.toString(),
      qty: "10.00000000", // 10 tons
      premium: "5.00000000", // $5 per ton premium
      indexId,
      expirationDate: expirationDate.toISOString(),
      status: "OPEN" as const,
    };

    const response = await fetch(`${API_BASE}/api/options`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(optionData),
    });

    if (!response.ok) {
      console.error("❌ Failed to create option:", await response.text());
      return null;
    }

    const option = await response.json();
    console.log(`✅ Created test option: ${option.id}`);
    console.log(`   Strike: $${strike}/ton, Current: $${currentPrice}/ton`);
    return option.id;
  } catch (error) {
    console.error("❌ Error creating option:", error);
    return null;
  }
}

async function matchOption(token: string, optionId: string, counterpartyId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/options/${optionId}/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ counterpartyId }),
    });

    if (!response.ok) {
      console.error("❌ Failed to match option:", await response.text());
      return false;
    }

    console.log(`✅ Matched option ${optionId}`);
    return true;
  } catch (error) {
    console.error("❌ Error matching option:", error);
    return false;
  }
}

async function checkPortfolio(token: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/api/portfolio/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error("❌ Failed to fetch portfolio:", await response.text());
      return;
    }

    const portfolio = await response.json();
    
    console.log("\n📊 Portfolio Summary:");
    console.log(`   Total P&L: $${portfolio.totalPnL}`);
    console.log(`   Realized P&L: $${portfolio.realizedPnL}`);
    console.log(`   Unrealized P&L: $${portfolio.unrealizedPnL}`);
    console.log(`   Open Positions: ${portfolio.openPositions}`);
    console.log(`   Locked Collateral: $${portfolio.lockedCollateral}`);
    console.log(`   Margin Calls: ${portfolio.marginCalls}`);
    console.log(`   Positions count: ${portfolio.positions.length}`);

    if (portfolio.positions.length > 0) {
      console.log("\n📋 Option Positions:");
      portfolio.positions.slice(0, 3).forEach((pos: any) => {
        console.log(`   - ${pos.type} ${pos.role}: Strike $${pos.strike}, Qty ${pos.qty}t, P&L $${pos.pnl}`);
      });
    }
  } catch (error) {
    console.error("❌ Error checking portfolio:", error);
  }
}

async function main() {
  console.log("🧪 Starting Portfolio Smoke Test\n");

  // Step 1: Get auth token
  console.log("Step 1: Authenticating...");
  const token = await getAuthToken();
  if (!token) {
    console.error("❌ Authentication failed. Exiting.");
    process.exit(1);
  }
  console.log("✅ Authenticated\n");

  // Step 2: Get current Wheat 11.5% price
  console.log("Step 2: Getting current Wheat 11.5% price...");
  const priceInfo = await getCurrentWheatPrice();
  if (!priceInfo) {
    console.error("❌ Failed to get price. Exiting.");
    process.exit(1);
  }
  console.log(`✅ Current Wheat 11.5% price: $${priceInfo.price}/ton\n`);

  // Step 3: Create in-the-money CALL option (strike 20% below current price)
  console.log("Step 3: Creating in-the-money CALL option...");
  const strike = Math.floor(priceInfo.price * 0.8); // 20% below current
  const optionId = await createTestOption(token, priceInfo.indexId, strike, priceInfo.price);
  if (!optionId) {
    console.error("❌ Failed to create option. Exiting.");
    process.exit(1);
  }
  console.log(`✅ Created option with strike $${strike}/ton (current: $${priceInfo.price}/ton)\n`);

  // Step 4: Update price to make it clearly in-the-money
  console.log("Step 4: Updating price to make option clearly in-the-money...");
  const newPrice = Math.floor(priceInfo.price * 1.3); // 30% above original
  await updateWheatPrice(token, newPrice);
  console.log(`✅ New price: $${newPrice}/ton (strike: $${strike}/ton, intrinsic: $${newPrice - strike}/ton)\n`);

  // Wait a bit for price to propagate
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 5: Check portfolio
  console.log("Step 5: Checking portfolio...");
  await checkPortfolio(token);

  console.log("\n✅ Smoke test complete!");
}

main().catch(console.error);

