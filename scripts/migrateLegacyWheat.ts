/**
 * One-off migration script to normalize legacy WHEAT data to Wheat 11.5%.
 *
 * This script:
 * - Ensures all legacy `WHEAT` symbols in index_prices are renamed to `Wheat 11.5%`
 * - Ensures all legacy `WHEAT` option commodities are renamed to `Wheat 11.5%`
 * - Re-links any legacy `wheat` index rows to the canonical `wheat-115` index
 *   in `commodity_index_prices` and `options.index_id`
 *
 * Run manually:
 *   npx ts-node scripts/migrateLegacyWheat.ts
 */

import { db } from "../server/db";
import {
  indexes,
  commodityIndexPrices,
  options,
  indexPrices,
  spotPositions,
} from "@shared/schema";
import { eq } from "drizzle-orm";

async function migrateLegacyWheat() {
  console.log("🔄 Starting legacy WHEAT → Wheat 11.5% migration...");

  // 1. Locate canonical Wheat 11.5% index (slug = wheat-115)
  const [wheat115] = await db
    .select()
    .from(indexes)
    .where(eq(indexes.slug, "wheat-115"))
    .limit(1);

  if (!wheat115) {
    console.warn("⚠️ No canonical index with slug 'wheat-115' found. Skipping indexId remapping.");
  } else {
    console.log(`✅ Found canonical Wheat 11.5% index: id=${wheat115.id}, name=${wheat115.name}`);
  }

  // 2. Find any legacy index rows with slug 'wheat'
  const legacyWheatIndexes = await db
    .select()
    .from(indexes)
    .where(eq(indexes.slug, "wheat"));

  if (legacyWheatIndexes.length > 0 && wheat115) {
    console.log(`🔎 Found ${legacyWheatIndexes.length} legacy index(es) with slug 'wheat'. Remapping...`);

    for (const legacy of legacyWheatIndexes) {
      // Re-link commodity_index_prices
      const updatedPrices = await db
        .update(commodityIndexPrices)
        .set({ indexId: wheat115.id })
        .where(eq(commodityIndexPrices.indexId, legacy.id))
        .returning();
      console.log(`  • Updated ${updatedPrices.length} commodity_index_prices from legacy index ${legacy.id} → ${wheat115.id}`);

      // Re-link options.indexId
      const updatedOptions = await db
        .update(options)
        .set({ indexId: wheat115.id })
        .where(eq(options.indexId, legacy.id))
        .returning();
      console.log(`  • Updated ${updatedOptions.length} options from legacy index ${legacy.id} → ${wheat115.id}`);
    }
  }

  // 3. Normalize options.commodity string
  const updatedOptionsCommodity = await db
    .update(options)
    .set({ commodity: "Wheat 11.5%" })
    .where(eq(options.commodity, "WHEAT"))
    .returning({ id: options.id });

  console.log(`✅ Updated ${updatedOptionsCommodity.length} options commodity values WHEAT → "Wheat 11.5%"`);

  // 4. Normalize index_prices.commodity string (legacy flat index table)
  const updatedIndexPrices = await db
    .update(indexPrices)
    .set({ commodity: "Wheat 11.5%" })
    .where(eq(indexPrices.commodity, "WHEAT"))
    .returning({ id: indexPrices.id });

  console.log(`✅ Updated ${updatedIndexPrices.length} index_prices rows WHEAT → "Wheat 11.5%"`);

  // 5. Normalize spot_positions.commoditySlug if any legacy 'wheat' slugs exist
  const updatedSpotPositions = await db
    .update(spotPositions)
    .set({ commoditySlug: "wheat-115" })
    .where(eq(spotPositions.commoditySlug, "wheat"))
    .returning({ id: spotPositions.id });

  console.log(`✅ Updated ${updatedSpotPositions.length} spot_positions slugs wheat → wheat-115`);

  console.log("🎉 Legacy WHEAT migration completed.");
}

migrateLegacyWheat()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });


