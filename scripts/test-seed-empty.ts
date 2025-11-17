import { db } from "../server/db";
import { indexes, commodityIndexPrices } from "../shared/schema";
import { seedCommodityIndexes } from "../server/seed/commodityIndexes";

async function testSeedWithEmptyTable() {
  console.log("🧪 Testing seed script with empty indexes table...\n");

  try {
    // Step 1: Delete all data (simulate empty production database)
    console.log("📦 Simulating empty database:");
    await db.delete(commodityIndexPrices);
    await db.delete(indexes);
    
    const beforeCount = await db.select().from(indexes);
    console.log(`   - Indexes count before seed: ${beforeCount.length}\n`);

    // Step 2: Run seed function
    console.log("🌱 Running seed script:");
    await seedCommodityIndexes();
    console.log();

    // Step 3: Verify all 7 commodities were inserted
    const afterIndexes = await db.select().from(indexes);
    console.log(`📊 Verification:`);
    console.log(`   - Total indexes in database: ${afterIndexes.length}`);
    
    const requiredSlugs = [
      "corn",
      "wheat-115",
      "feed-wheat",
      "gmo-soybeans",
      "gmo-soybeans-processing",
      "rapeseed",
      "sunflower-seed"
    ];

    const foundSlugs = new Set(afterIndexes.map(idx => idx.slug));
    const missing = requiredSlugs.filter(slug => !foundSlugs.has(slug));
    const extra = afterIndexes.filter(idx => !requiredSlugs.includes(idx.slug));

    if (missing.length === 0 && extra.length === 0) {
      console.log(`   ✅ SUCCESS: All 7 required commodities present`);
      
      // Show all indexes
      console.log(`\n📋 Seeded commodities:`);
      afterIndexes.forEach(idx => {
        console.log(`   - ${idx.name.padEnd(30)} (${idx.slug.padEnd(25)}) [${idx.category}] VAT: ${idx.hasVat}`);
      });
    } else {
      console.log(`   ❌ FAILED: Seed verification failed`);
      if (missing.length > 0) console.log(`   Missing: ${missing.join(", ")}`);
      if (extra.length > 0) console.log(`   Extra: ${extra.map(e => e.slug).join(", ")}`);
    }

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

// Run test
testSeedWithEmptyTable()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
