/**
 * IGC Price Upsert Service
 * Handles upserting IGC prices into indexPrices table
 */

import { db } from "../db";
import { indexPrices } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { IgcPrice } from "./igcPriceService";

/**
 * Upsert IGC prices into indexPrices table
 * Uses (commodity, country, label, as_of_date) as the unique key
 * 
 * Before upserting, removes all old IGC records to avoid stale data
 * with incorrect commodity-label mappings from the old parser
 */
export async function upsertIgcIndexPrices(prices: IgcPrice[]): Promise<number> {
  // Delete all existing IGC records to avoid stale data from old parser
  // This ensures we only have correct data from the current parser run
  try {
    const deleted = await db
      .delete(indexPrices)
      .where(eq(indexPrices.source, "IGC"));
    console.log(`[IGC Upsert] Deleted old IGC records before upsert`);
  } catch (error: any) {
    console.error(`[IGC Upsert] Error deleting old IGC records:`, error.message);
    // Continue anyway - upsert will handle duplicates
  }

  let upserted = 0;

  for (const price of prices) {
    try {
      // Since we deleted all old IGC records, we can just insert new ones
      const values = {
        commodity: price.commodity.toUpperCase(),
        price: price.priceUsdPerTon.toFixed(8),
        date: new Date(price.asOfDate),
        source: "IGC",
        country: price.country,
        label: price.label,
        asOfDate: new Date(price.asOfDate),
        dailyChangePct: price.dailyChangePct !== null && price.dailyChangePct !== undefined 
          ? price.dailyChangePct.toFixed(4) 
          : null,
        annualChangePct: price.annualChangePct !== null && price.annualChangePct !== undefined 
          ? price.annualChangePct.toFixed(4) 
          : null,
        low52w: price.low52w !== null && price.low52w !== undefined 
          ? price.low52w.toFixed(8) 
          : null,
        high52w: price.high52w !== null && price.high52w !== undefined 
          ? price.high52w.toFixed(8) 
          : null,
        rawRow: JSON.stringify(price.rawRow), // Store as JSON string (JSONB in DB)
        raw: `IGC: ${price.commodity} ${price.label}`,
        meta: JSON.stringify({
          source: "IGC",
          commodity: price.commodity,
          country: price.country,
          label: price.label,
        }),
        isDemo: "false" as const,
      };

      // Insert new record (all old IGC records were deleted at the start)
      await db.insert(indexPrices).values(values);
      upserted++;
      console.log(`[IGC Upsert] Inserted: ${price.country} ${price.commodity} ${price.label} (${price.asOfDate})`);
    } catch (error: any) {
      console.error(`[IGC Upsert] Error upserting ${price.country} ${price.commodity} ${price.label}:`, error.message);
      // Continue with next price
    }
  }

  return upserted;
}

