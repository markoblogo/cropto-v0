import { db } from "../db";
import { options, indexPrices } from "@shared/schema";
import { createUser, findUserByEmail, hashPassword } from "../auth";
import { collateralPct, computeNotional } from "../utils/finance";
import fs from "fs/promises";
import path from "path";

interface DemoUser {
  email: string;
  password: string;
  role: 'farmer' | 'trader' | 'broker';
}

interface DemoOption {
  title: string;
  type: 'CALL' | 'PUT';
  strike: string;
  qty: string;
  premium: string;
  buyer: string;
  seller?: string;
  status: 'OPEN' | 'FILLED' | 'EXPIRED' | 'CANCELLED';
  commodity?: string;
  buyerId?: string;
  issuerId?: string;
  collateralAmount?: string;
}

interface DemoIndexPrice {
  commodity: string;
  price: string;
  date?: Date;
}

export async function seedDemoData() {
  console.log('🌱 Starting demo data seeding...');

  const results = {
    users: [] as any[],
    options: [] as any[],
    indexPrices: [] as any[],
    deleted: {
      options: 0,
      indexPrices: 0,
    },
  };

  // 1. Create demo users
  const demoUsers: DemoUser[] = [
    { email: 'farmer@demo', password: 'pass', role: 'farmer' },
    { email: 'trader@demo', password: 'pass', role: 'trader' },
    { email: 'broker@demo', password: 'pass', role: 'broker' },
  ];

  console.log('📝 Creating demo users...');
  for (const demoUser of demoUsers) {
    try {
      // Check if user already exists
      const existingUser = await findUserByEmail(demoUser.email);
      if (existingUser) {
        console.log(`  ℹ️  User ${demoUser.email} already exists, skipping`);
        results.users.push({ email: demoUser.email, status: 'already_exists', id: existingUser.id });
      } else {
        const user = await createUser(demoUser.email, demoUser.password, demoUser.role);
        console.log(`  ✅ Created user: ${demoUser.email} (${demoUser.role})`);
        results.users.push({ 
          email: user.email, 
          role: user.role, 
          id: user.id,
          status: 'created'
        });
      }
    } catch (error) {
      console.error(`  ❌ Error creating user ${demoUser.email}:`, error);
      results.users.push({ email: demoUser.email, status: 'error', error: String(error) });
    }
  }

  // Get user IDs for option creation
  const farmerUser = await findUserByEmail('farmer@demo');
  const traderUser = await findUserByEmail('trader@demo');
  const brokerUser = await findUserByEmail('broker@demo');

  const farmerId = farmerUser?.id || 'farmer@demo';
  const traderId = traderUser?.id || 'trader@demo';
  const brokerId = brokerUser?.id || 'broker@demo';

  // 2. Clean existing demo data (make idempotent)
  console.log('🧹 Cleaning existing demo data...');
  try {
    // Delete existing demo options (identified by isDemo='true')
    const { eq } = await import("drizzle-orm");
    const deletedOptions = await db
      .delete(options)
      .where(eq(options.isDemo, 'true'))
      .returning();
    results.deleted.options = deletedOptions.length;
    console.log(`  🗑️  Deleted ${deletedOptions.length} existing demo options`);

    // Delete existing demo index prices (identified by isDemo='true')
    const deletedIndexPrices = await db
      .delete(indexPrices)
      .where(eq(indexPrices.isDemo, 'true'))
      .returning();
    results.deleted.indexPrices = deletedIndexPrices.length;
    console.log(`  🗑️  Deleted ${deletedIndexPrices.length} existing demo index prices`);
  } catch (error) {
    console.error('  ⚠️  Error cleaning existing demo data:', error);
  }

  // 3. Create demo index prices
  const demoIndexPrices: DemoIndexPrice[] = [
    { commodity: 'WHEAT', price: '210.00000000' },
    { commodity: 'WHEAT', price: '240.00000000', date: new Date(Date.now() + 24 * 60 * 60 * 1000) }, // Tomorrow
  ];

  console.log('💰 Creating demo index prices...');
  for (const indexPrice of demoIndexPrices) {
    try {
      const [createdIndexPrice] = await db
        .insert(indexPrices)
        .values({
          commodity: indexPrice.commodity,
          price: indexPrice.price,
          date: indexPrice.date,
          isDemo: 'true',
        })
        .returning();
      
      console.log(`  ✅ Created index price: ${indexPrice.commodity} @ ${indexPrice.price}`);
      results.indexPrices.push(createdIndexPrice);
    } catch (error) {
      console.error(`  ❌ Error creating index price:`, error);
      results.indexPrices.push({ commodity: indexPrice.commodity, status: 'error', error: String(error) });
    }
  }

  // 4. Create demo options with computed collateral
  const demoOptions: DemoOption[] = [
    {
      title: 'WHEAT CALL Option - Strike 220',
      type: 'CALL',
      strike: '220.00000000',
      qty: '100.00000000',
      premium: '15.50000000',
      buyer: farmerId,
      status: 'OPEN',
      commodity: 'WHEAT',
      buyerId: farmerId,
      issuerId: farmerId,
    },
    {
      title: 'WHEAT PUT Option - Strike 200',
      type: 'PUT',
      strike: '200.00000000',
      qty: '150.00000000',
      premium: '12.00000000',
      buyer: traderId,
      seller: farmerId,
      status: 'FILLED',
      commodity: 'WHEAT',
      buyerId: traderId,
      issuerId: farmerId,
    },
    {
      title: 'WHEAT CALL Option - Strike 250',
      type: 'CALL',
      strike: '250.00000000',
      qty: '75.00000000',
      premium: '20.00000000',
      buyer: brokerId,
      status: 'OPEN',
      commodity: 'WHEAT',
      buyerId: brokerId,
      issuerId: brokerId,
    },
  ];

  console.log('📊 Creating demo options...');
  for (const option of demoOptions) {
    try {
      // Calculate collateral (using 5% for 3-month expiry as default)
      const notional = computeNotional(parseFloat(option.strike), parseFloat(option.qty));
      const collateralPercent = collateralPct(3); // Assume 3 months
      const collateralAmount = (notional * collateralPercent).toFixed(8);

      const [createdOption] = await db
        .insert(options)
        .values({
          ...option,
          collateralAmount,
          lastIntrinsic: '0.00000000',
          payoutAccumulated: '0.00000000',
          isDemo: 'true',
        })
        .returning();
      
      console.log(`  ✅ Created option: ${option.title} (Collateral: ${collateralAmount})`);
      results.options.push(createdOption);
    } catch (error) {
      console.error(`  ❌ Error creating option ${option.title}:`, error);
      results.options.push({ title: option.title, status: 'error', error: String(error) });
    }
  }

  console.log('✨ Demo data seeding complete!');
  console.log(`   Users: ${results.users.length}`);
  console.log(`   Options: ${results.options.length}`);
  console.log(`   Index Prices: ${results.indexPrices.length}`);

  return results;
}

// Allow running directly from command line
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoData()
    .then((results) => {
      console.log('\n📋 Seeding results:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}
