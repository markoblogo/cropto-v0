import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { options, trades, settlements, indexPrices, marginCalls, transactions } from "../shared/schema";
import { readFileSync } from "fs";
import { join } from "path";

neonConfig.webSocketConstructor = ws;

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

async function importDemoData() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Importing demo data to database...");
  console.log(`📍 Database: ${databaseUrl.substring(0, 30)}...`);

  // Read export file
  const inputPath = join(process.cwd(), "demo-data-export.json");
  let exportData: DemoData;

  try {
    const fileContent = readFileSync(inputPath, "utf-8");
    exportData = JSON.parse(fileContent);
    console.log(`✓ Loaded export file from ${inputPath}`);
    console.log(`  Exported at: ${exportData.exportedAt}`);
    console.log(`  Version: ${exportData.version}`);
  } catch (error) {
    console.error("❌ Failed to read export file:", error);
    console.log("\n💡 Run 'npm run export-demo' first to create the export file");
    process.exit(1);
  }

  // Connect to database
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool });

  try {
    // Import in a transaction for atomicity
    await pool.query("BEGIN");
    
    let importedCounts = {
      indexPrices: 0,
      options: 0,
      trades: 0,
      settlements: 0,
      marginCalls: 0,
      transactions: 0,
    };

    try {
      // Import index prices first (no dependencies)
      if (exportData.indexPrices.length > 0) {
        console.log(`\n📊 Importing ${exportData.indexPrices.length} index prices...`);
        for (const price of exportData.indexPrices) {
          const result = await db.insert(indexPrices).values(price).onConflictDoNothing().returning({ id: indexPrices.id });
          if (result.length > 0) importedCounts.indexPrices++;
        }
        console.log(`✓ Index prices imported (${importedCounts.indexPrices} new, ${exportData.indexPrices.length - importedCounts.indexPrices} skipped)`);
      }

      // Import options
      if (exportData.options.length > 0) {
        console.log(`\n📝 Importing ${exportData.options.length} options...`);
        for (const option of exportData.options) {
          const result = await db.insert(options).values(option).onConflictDoNothing().returning({ id: options.id });
          if (result.length > 0) importedCounts.options++;
        }
        console.log(`✓ Options imported (${importedCounts.options} new, ${exportData.options.length - importedCounts.options} skipped)`);
        
        if (importedCounts.options === 0 && exportData.options.length > 0) {
          console.warn("⚠️  WARNING: All options were skipped - they may already exist in the database");
        }
      }

      // Import trades
      if (exportData.trades.length > 0) {
        console.log(`\n💰 Importing ${exportData.trades.length} trades...`);
        for (const trade of exportData.trades) {
          const result = await db.insert(trades).values(trade).onConflictDoNothing().returning({ id: trades.id });
          if (result.length > 0) importedCounts.trades++;
        }
        console.log(`✓ Trades imported (${importedCounts.trades} new, ${exportData.trades.length - importedCounts.trades} skipped)`);
      }

      // Import settlements
      if (exportData.settlements.length > 0) {
        console.log(`\n🏁 Importing ${exportData.settlements.length} settlements...`);
        for (const settlement of exportData.settlements) {
          const result = await db.insert(settlements).values(settlement).onConflictDoNothing().returning({ id: settlements.id });
          if (result.length > 0) importedCounts.settlements++;
        }
        console.log(`✓ Settlements imported (${importedCounts.settlements} new, ${exportData.settlements.length - importedCounts.settlements} skipped)`);
      }

      // Import margin calls
      if (exportData.marginCalls.length > 0) {
        console.log(`\n⚠️  Importing ${exportData.marginCalls.length} margin calls...`);
        for (const marginCall of exportData.marginCalls) {
          const result = await db.insert(marginCalls).values(marginCall).onConflictDoNothing().returning({ id: marginCalls.id });
          if (result.length > 0) importedCounts.marginCalls++;
        }
        console.log(`✓ Margin calls imported (${importedCounts.marginCalls} new, ${exportData.marginCalls.length - importedCounts.marginCalls} skipped)`);
      }

      // Import transactions
      if (exportData.transactions.length > 0) {
        console.log(`\n💸 Importing ${exportData.transactions.length} transactions...`);
        for (const transaction of exportData.transactions) {
          const result = await db.insert(transactions).values(transaction).onConflictDoNothing().returning({ id: transactions.id });
          if (result.length > 0) importedCounts.transactions++;
        }
        console.log(`✓ Transactions imported (${importedCounts.transactions} new, ${exportData.transactions.length - importedCounts.transactions} skipped)`);
      }

      // Commit transaction
      await pool.query("COMMIT");
      console.log("\n✅ Transaction committed successfully!");
    } catch (error) {
      // Rollback on error
      await pool.query("ROLLBACK");
      throw error;
    }

    console.log(`\n✅ Demo data imported successfully!`);
    console.log(`\n📊 Final Summary:`);
    console.log(`   - Options: ${importedCounts.options}/${exportData.options.length} imported`);
    console.log(`   - Trades: ${importedCounts.trades}/${exportData.trades.length} imported`);
    console.log(`   - Settlements: ${importedCounts.settlements}/${exportData.settlements.length} imported`);
    console.log(`   - Index Prices: ${importedCounts.indexPrices}/${exportData.indexPrices.length} imported`);
    console.log(`   - Margin Calls: ${importedCounts.marginCalls}/${exportData.marginCalls.length} imported`);
    console.log(`   - Transactions: ${importedCounts.transactions}/${exportData.transactions.length} imported`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Import failed:", error);
    process.exit(1);
  }
}

importDemoData();
