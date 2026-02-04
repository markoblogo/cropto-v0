/**
 * Database Migration Runner
 * Executes SQL migration files from db/migrations in alphabetical order
 */

import * as dotenv from "dotenv";
dotenv.config();

import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith(".sql"))
    .sort(); // Alphabetical order
}

async function executeMigration(pool: Pool, filename: string): Promise<void> {
  const filepath = join(MIGRATIONS_DIR, filename);
  const sqlContent = await readFile(filepath, "utf-8");

  console.log(`\n📄 Running migration: ${filename}`);
  
  try {
    // Execute the SQL content using Pool.query
    await pool.query(sqlContent);
    
    console.log(`✅ Migration ${filename} completed successfully`);
  } catch (error: any) {
    console.error(`❌ Migration ${filename} failed:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

async function main() {
  console.log("🚀 Starting database migrations...");
  console.log(`📁 Migrations directory: ${MIGRATIONS_DIR}`);
  console.log(`🔗 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`); // Hide password

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const migrations = await getMigrationFiles();
    
    if (migrations.length === 0) {
      console.log("⚠️  No migration files found");
      await pool.end();
      process.exit(0);
    }

    console.log(`\n📋 Found ${migrations.length} migration(s):`);
    migrations.forEach((file) => console.log(`   - ${file}`));

    for (const migration of migrations) {
      await executeMigration(pool, migration);
    }

    console.log("\n✅ All migrations completed successfully!");
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Migration process failed:", error.message);
    await pool.end();
    process.exit(1);
  }
}

main();

