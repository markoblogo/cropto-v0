import { options, trades, settlements, indexPrices, marginCalls, transactions } from "../shared/schema";
import { readFileSync } from "fs";
import { join } from "path";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

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

export async function autoImportDemoData(db: any): Promise<void> {
  console.log("\n🔍 Checking for demo data in database...");

  try {
    // Check if demo data already exists
    const demoOptionsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(options)
      .where(eq(options.isDemo, "true"));

    const existingDemoCount = Number(demoOptionsCount[0]?.count || 0);

    if (existingDemoCount > 0) {
      console.log(`✓ Demo data already exists (${existingDemoCount} demo options found)`);
      console.log("  Skipping auto-import");
      return;
    }

    console.log("📦 No demo data found, starting auto-import...");

    // Read export file
    const inputPath = join(process.cwd(), "demo-data-export.json");
    let exportData: DemoData;

    try {
      const fileContent = readFileSync(inputPath, "utf-8");
      exportData = JSON.parse(fileContent);
      console.log(`✓ Loaded demo data file (exported: ${exportData.exportedAt})`);
    } catch (error) {
      console.warn("⚠️  Warning: demo-data-export.json not found, skipping auto-import");
      return;
    }

    // Import data in a transaction
    let importedCounts = {
      indexPrices: 0,
      options: 0,
      trades: 0,
      settlements: 0,
      marginCalls: 0,
      transactions: 0,
    };

    await db.transaction(async (tx: any) => {
      // Import index prices first (no dependencies)
      if (exportData.indexPrices.length > 0) {
        console.log(`  📊 Importing ${exportData.indexPrices.length} index prices...`);
        for (const price of exportData.indexPrices) {
          const result = await tx.insert(indexPrices).values(price).onConflictDoNothing().returning({ id: indexPrices.id });
          if (result.length > 0) importedCounts.indexPrices++;
        }
      }

      // Import options
      if (exportData.options.length > 0) {
        console.log(`  📝 Importing ${exportData.options.length} options...`);
        for (const option of exportData.options) {
          const result = await tx.insert(options).values(option).onConflictDoNothing().returning({ id: options.id });
          if (result.length > 0) importedCounts.options++;
        }
      }

      // Import trades
      if (exportData.trades.length > 0) {
        console.log(`  💰 Importing ${exportData.trades.length} trades...`);
        for (const trade of exportData.trades) {
          const result = await tx.insert(trades).values(trade).onConflictDoNothing().returning({ id: trades.id });
          if (result.length > 0) importedCounts.trades++;
        }
      }

      // Import settlements
      if (exportData.settlements.length > 0) {
        console.log(`  🏁 Importing ${exportData.settlements.length} settlements...`);
        for (const settlement of exportData.settlements) {
          const result = await tx.insert(settlements).values(settlement).onConflictDoNothing().returning({ id: settlements.id });
          if (result.length > 0) importedCounts.settlements++;
        }
      }

      // Import margin calls
      if (exportData.marginCalls.length > 0) {
        console.log(`  ⚠️  Importing ${exportData.marginCalls.length} margin calls...`);
        for (const marginCall of exportData.marginCalls) {
          const result = await tx.insert(marginCalls).values(marginCall).onConflictDoNothing().returning({ id: marginCalls.id });
          if (result.length > 0) importedCounts.marginCalls++;
        }
      }

      // Import transactions
      if (exportData.transactions.length > 0) {
        console.log(`  💸 Importing ${exportData.transactions.length} transactions...`);
        for (const transaction of exportData.transactions) {
          const result = await tx.insert(transactions).values(transaction).onConflictDoNothing().returning({ id: transactions.id });
          if (result.length > 0) importedCounts.transactions++;
        }
      }
    });

    console.log(`✅ Demo data auto-imported successfully!`);
    console.log(`   - Options: ${importedCounts.options}/${exportData.options.length}`);
    console.log(`   - Trades: ${importedCounts.trades}/${exportData.trades.length}`);
    console.log(`   - Settlements: ${importedCounts.settlements}/${exportData.settlements.length}`);
    console.log(`   - Index Prices: ${importedCounts.indexPrices}/${exportData.indexPrices.length}`);
    console.log(`   - Margin Calls: ${importedCounts.marginCalls}/${exportData.marginCalls.length}`);
    console.log(`   - Transactions: ${importedCounts.transactions}/${exportData.transactions.length}\n`);

  } catch (error) {
    console.error("❌ Error during auto-import:", error);
    throw error;
  }
}
