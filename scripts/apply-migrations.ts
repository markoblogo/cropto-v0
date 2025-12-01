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
  const migrationPath = join(process.cwd(), 'db', 'migrations', migrationFile);
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
    throw error;
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
    ];

    for (const migration of migrations) {
      await applyMigration(pool, migration);
    }

    console.log('\n✅ All migrations applied successfully!');
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

