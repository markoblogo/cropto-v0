import { db } from "../db";
import { indexes } from "@shared/schema";
import { sql } from "drizzle-orm";

const COMMODITY_INDEXES = [
  // CPT ODESA - Export commodities (no VAT)
  {
    name: "Corn",
    slug: "corn",
    category: "CPT ODESA",
    hasVat: "false" as const,
  },
  {
    name: "Wheat 11.5%",
    slug: "wheat-115",
    category: "CPT ODESA",
    hasVat: "false" as const,
  },
  {
    name: "Feed Wheat",
    slug: "feed-wheat",
    category: "CPT ODESA",
    hasVat: "false" as const,
  },
  {
    name: "GMO Soybeans",
    slug: "gmo-soybeans",
    category: "CPT ODESA",
    hasVat: "false" as const,
  },
  // CPT PARITET ODESA - Processing commodities (with VAT)
  {
    name: "GMO Soybeans (processing)",
    slug: "gmo-soybeans-processing",
    category: "CPT PARITET ODESA",
    hasVat: "true" as const,
  },
  {
    name: "Rapeseed",
    slug: "rapeseed",
    category: "CPT PARITET ODESA",
    hasVat: "true" as const,
  },
  {
    name: "Sunflower Seed",
    slug: "sunflower-seed",
    category: "CPT PARITET ODESA",
    hasVat: "true" as const,
  },
];

export async function seedCommodityIndexes(): Promise<void> {
  console.log("🌾 Checking commodity indexes...");

  try {
    // Fetch all existing indexes to check which ones are missing
    const existingIndexes = await db.select().from(indexes);
    const existingSlugs = new Set(existingIndexes.map(idx => idx.slug));

    let insertedCount = 0;
    let updatedCount = 0;

    // Check each required commodity and insert if missing
    for (const commodity of COMMODITY_INDEXES) {
      if (!existingSlugs.has(commodity.slug)) {
        // Insert missing commodity
        await db.insert(indexes).values(commodity);
        console.log(`  ✓ Inserted ${commodity.name} (${commodity.slug})`);
        insertedCount++;
      } else {
        // Update hasVat if needed for existing commodity
        const existing = existingIndexes.find(idx => idx.slug === commodity.slug);
        if (existing && existing.hasVat !== commodity.hasVat) {
          await db
            .update(indexes)
            .set({ hasVat: commodity.hasVat })
            .where(sql`${indexes.slug} = ${commodity.slug}`);
          console.log(`  ✓ Updated ${commodity.name} hasVat to ${commodity.hasVat}`);
          updatedCount++;
        }
      }
    }

    // Summary
    if (insertedCount === 0 && updatedCount === 0) {
      console.log(`✓ All ${COMMODITY_INDEXES.length} commodity indexes present and up-to-date`);
    } else {
      console.log(`✅ Commodity indexes seeding complete:`);
      if (insertedCount > 0) console.log(`   - Inserted: ${insertedCount} new commodities`);
      if (updatedCount > 0) console.log(`   - Updated: ${updatedCount} commodities`);
      console.log(`   - Total: ${COMMODITY_INDEXES.length} commodities (${existingIndexes.length + insertedCount} in database)`);
    }

    // Verify all required commodities are present
    const finalIndexes = await db.select().from(indexes);
    const finalSlugs = new Set(finalIndexes.map(idx => idx.slug));
    const requiredSlugs = COMMODITY_INDEXES.map(c => c.slug);
    const missing = requiredSlugs.filter(slug => !finalSlugs.has(slug));
    
    if (missing.length > 0) {
      throw new Error(`Failed to seed required commodities: ${missing.join(", ")}`);
    }

  } catch (error) {
    console.error("❌ Error seeding commodity indexes:", error);
    throw error;
  }
}
