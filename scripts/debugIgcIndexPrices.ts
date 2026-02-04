/**
 * Debug script to check IGC price data in the database
 */

import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../server/db";
import { indexPrices } from "../shared/schema";
import { eq, desc, inArray, and } from "drizzle-orm";

async function debugIgcIndexPrices() {
  console.log("🔍 Checking IGC index prices in database...\n");

  try {
    const igcRecords = await db
      .select({
        country: indexPrices.country,
        commodity: indexPrices.commodity,
        label: indexPrices.label,
        price: indexPrices.price,
        asOfDate: indexPrices.asOfDate,
        source: indexPrices.source,
        date: indexPrices.date,
      })
      .from(indexPrices)
      .where(
        and(
          eq(indexPrices.source, "IGC"),
          inArray(indexPrices.country, ["BR", "AR", "US"])
        )
      )
      .orderBy(desc(indexPrices.date))
      .limit(30);

    if (igcRecords.length === 0) {
      console.log("❌ No IGC records found in database for BR/AR/US");
      console.log("\n💡 Run: npx tsx server/jobs/igcPoller.ts to fetch IGC data");
      process.exit(0);
    }

    console.log(`✅ Found ${igcRecords.length} IGC record(s):\n`);

    for (const record of igcRecords) {
      let asOfDateStr: string | null = null;
      if (record.asOfDate) {
        try {
          const date = typeof record.asOfDate === 'string' ? new Date(record.asOfDate) : record.asOfDate;
          if (!isNaN(date.getTime())) {
            asOfDateStr = date.toISOString().split("T")[0];
          }
        } catch {
          // Skip invalid date
        }
      }
      
      let dateStr: string | null = null;
      if (record.date) {
        try {
          const date = typeof record.date === 'string' ? new Date(record.date) : record.date;
          if (!isNaN(date.getTime())) {
            dateStr = date.toISOString().split("T")[0];
          }
        } catch {
          // Skip invalid date
        }
      }
      
      console.log({
        country: record.country,
        commodity: record.commodity,
        label: record.label || "(no label)",
        price: record.price,
        asOfDate: asOfDateStr,
        source: record.source,
        date: dateStr,
      });
    }

    // Group by country
    const byCountry = igcRecords.reduce((acc, rec) => {
      const country = rec.country || "unknown";
      if (!acc[country]) acc[country] = [];
      acc[country].push(rec);
      return acc;
    }, {} as Record<string, typeof igcRecords>);

    console.log("\n📊 Summary by country:");
    for (const [country, records] of Object.entries(byCountry)) {
      console.log(`  ${country}: ${records.length} record(s)`);
    }

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error querying database:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

debugIgcIndexPrices();

