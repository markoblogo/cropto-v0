#!/usr/bin/env tsx
/**
 * Apply database migrations manually
 * This script applies SQL migrations from db/migrations/ directory
 */

import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from '@neondatabase/serverless';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in environment variables");
}

async function applyMigration(pool: Pool, migrationFile: string) {
  // Try db/migrations first, then migrations directory
  let migrationPath = join(process.cwd(), 'db', 'migrations', migrationFile);
  try {
    readFileSync(migrationPath, 'utf-8');
  } catch {
    migrationPath = join(process.cwd(), 'migrations', migrationFile);
  }

  console.log(`\n📄 Reading migration: ${migrationFile}`);

  let sql = readFileSync(migrationPath, 'utf-8');
  
  // Remove comments (lines starting with --)
  sql = sql.split('\n')
    .filter(line => !line.trim().startsWith('--') || line.trim().startsWith('-- Migration:'))
    .join('\n');
  
  try {
    // Execute the entire migration as one query
    // PostgreSQL handles DO blocks and multiple statements correctly
    await pool.query(sql);
    console.log(`✅ Applied migration: ${migrationFile}`);
    return true;
  } catch (error: any) {
    // Ignore "already exists" errors (IF NOT EXISTS clauses)
    if (error.message?.includes('already exists') || 
        error.message?.includes('duplicate') ||
        error.message?.includes('already applied') ||
        error.code === '42P07' || // duplicate_table
        error.code === '42710' || // duplicate_object
        error.code === '42701') { // duplicate_column
      console.log(`⚠️  Migration ${migrationFile} already applied or skipped (${error.message})`);
      return true;
    }
    console.log(`❌ Migration ${migrationFile} failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying database migrations...\n');
  console.log(`Database: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Apply migrations in order
    const migrations = [
      '002_add_platform_fees_role.sql',
      '002b_rename_type_to_fee_type.sql',
      '002c_add_notional_amount.sql',
      '003_add_locked_collateral.sql',
      '004_add_partners_and_contracts.sql',
      '005_fix_platform_fees.sql',
      '012_add_partner_fee_share_percent.sql',
      '005_forward_schema.sql',
      '006_add_option_window_fields.sql',
      '007_add_option_contract_json.sql',
      '007_margin_calls_forward.sql',
      '008_expiry_window_not_null.sql',
      '008_transactions_onchain_hash.sql',
      '009_add_expiry_window_column.sql',
      '010_add_margin_fields.sql',
      '011_add_margin_call_fields.sql',
      '009_waitlist_signups.sql',
      '011_market_price_ingestion.sql',
      '012_ingestion_fx_and_identity.sql',
      '013_extend_user_role_broker.sql',
      '014_prediction_markets.sql',
      '015_prediction_markets_quality.sql',
      '016_agro_expectations.sql',
      '017_binance_market_snapshot.sql',
      '018_global_index_snapshot.sql',
      '019_sea_brokerage_entries.sql',
      '020_sea_brokerage_broker_auth.sql',
      '021_sea_brokerage_trade_broker_telegram_ids.sql',
      '022_sea_brokerage_trade_commissions.sql',
      '023_sea_brokerage_new_crop_flag.sql',
    ];

    let successCount = 0;
    for (const migration of migrations) {
      const success = await applyMigration(pool, migration);
      if (success) successCount++;
    }

    console.log(`\n✅ ${successCount}/${migrations.length} migrations applied successfully!`);
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
