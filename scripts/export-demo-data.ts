import { db } from "../server/db";
import { options, trades, settlements, indexPrices, marginCalls, transactions } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";

interface DemoData {
  options: any[];
  trades: any[];
  settlements: any[];
  indexPrices: any[];
  marginCalls: any[];
  transactions: any[];
  exportedAt: string;
  version: string;
}

async function exportDemoData() {
  console.log("🔄 Exporting demo data from development database...");

  try {
    // Export demo options
    const demoOptions = await db
      .select()
      .from(options)
      .where(eq(options.isDemo, "true"));

    console.log(`✓ Found ${demoOptions.length} demo options`);

    // Get option IDs for related data
    const optionIds = demoOptions.map(opt => opt.id);

    // Export ONLY related data for demo options
    const demoTrades = optionIds.length > 0 
      ? await db.select().from(trades).where(inArray(trades.optionId, optionIds))
      : [];

    const demoSettlements = optionIds.length > 0
      ? await db.select().from(settlements).where(inArray(settlements.optionId, optionIds))
      : [];

    const demoMarginCalls = optionIds.length > 0
      ? await db.select().from(marginCalls).where(inArray(marginCalls.optionId, optionIds))
      : [];

    const demoTransactions = optionIds.length > 0
      ? await db.select().from(transactions).where(inArray(transactions.optionId, optionIds))
      : [];

    // Export demo index prices
    const demoIndexPrices = await db
      .select()
      .from(indexPrices)
      .where(eq(indexPrices.isDemo, "true"));

    console.log(`✓ Found ${demoTrades.length} trades`);
    console.log(`✓ Found ${demoSettlements.length} settlements`);
    console.log(`✓ Found ${demoIndexPrices.length} index prices`);
    console.log(`✓ Found ${demoMarginCalls.length} margin calls`);
    console.log(`✓ Found ${demoTransactions.length} transactions`);

    // Create export object
    const exportData: DemoData = {
      options: demoOptions,
      trades: demoTrades,
      settlements: demoSettlements,
      indexPrices: demoIndexPrices,
      marginCalls: demoMarginCalls,
      transactions: demoTransactions,
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
    };

    // Save to file
    const outputPath = join(process.cwd(), "demo-data-export.json");
    writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

    console.log(`\n✅ Demo data exported successfully!`);
    console.log(`📁 File: ${outputPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Options: ${demoOptions.length}`);
    console.log(`   - Trades: ${demoTrades.length}`);
    console.log(`   - Settlements: ${demoSettlements.length}`);
    console.log(`   - Index Prices: ${demoIndexPrices.length}`);
    console.log(`   - Margin Calls: ${demoMarginCalls.length}`);
    console.log(`   - Transactions: ${demoTransactions.length}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Export failed:", error);
    process.exit(1);
  }
}

exportDemoData();
