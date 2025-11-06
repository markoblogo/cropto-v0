#!/usr/bin/env node

/**
 * Cropto Migration Script: File-based DB to Supabase
 * 
 * This script migrates data from the file-based storage (server/db.json)
 * and current PostgreSQL database to Supabase.
 * 
 * Usage:
 *   node server/scripts/migrateToSupabase.js
 * 
 * Required Environment Variables:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_KEY: Your Supabase service role key (not anon key!)
 *   - DATABASE_URL: Current PostgreSQL connection string (for migrating existing data)
 * 
 * Optional:
 *   - DB_MODE=filedb: Skip migration, just validate db.json
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'db.json');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

function warn(message) {
  log(`⚠ ${message}`, 'yellow');
}

// Check if running in filedb mode
const isFileDBMode = process.env.DB_MODE === 'filedb';

async function validateEnvironment() {
  log('\n=== Environment Validation ===\n', 'bright');
  
  if (isFileDBMode) {
    warn('Running in DB_MODE=filedb - skipping Supabase migration');
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!supabaseUrl || !supabaseKey) {
    error('Missing required environment variables:');
    if (!supabaseUrl) error('  - SUPABASE_URL');
    if (!supabaseKey) error('  - SUPABASE_KEY');
    process.exit(1);
  }

  if (!databaseUrl) {
    warn('DATABASE_URL not set - will only migrate users from db.json');
  }

  success('Environment variables validated');
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return { supabase, databaseUrl };
}

async function readFileDB() {
  log('\n=== Reading File Database ===\n', 'bright');
  
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const db = JSON.parse(data);
    
    success(`Found ${db.users?.length || 0} users in db.json`);
    return db;
  } catch (err) {
    warn('Could not read db.json - will create empty database');
    return { users: [] };
  }
}

async function migrateUsers(supabase, users) {
  if (!users || users.length === 0) {
    info('No users to migrate');
    return;
  }

  log('\n=== Migrating Users ===\n', 'bright');
  
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      // Check if user already exists
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single();

      if (existing) {
        info(`Skipping existing user: ${user.email}`);
        skipped++;
        continue;
      }

      // Insert user
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          password_hash: user.passwordHash,
          role: user.role,
          wallet_address: user.walletAddress || null,
          network: user.network || null,
          created_at: user.createdAt
        });

      if (insertError) {
        error(`Failed to migrate user ${user.email}: ${insertError.message}`);
      } else {
        success(`Migrated user: ${user.email}`);
        migrated++;
      }
    } catch (err) {
      error(`Error migrating user ${user.email}: ${err.message}`);
    }
  }

  success(`\nUsers migration complete: ${migrated} migrated, ${skipped} skipped`);
}

async function migratePostgresData(supabase, databaseUrl) {
  if (!databaseUrl) {
    info('No DATABASE_URL provided - skipping PostgreSQL data migration');
    return;
  }

  log('\n=== Migrating PostgreSQL Data ===\n', 'bright');

  const client = new pg.Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    success('Connected to source PostgreSQL database');

    // Define tables to migrate (excluding users which we already migrated)
    const tables = [
      'options',
      'trades',
      'settlements',
      'wallets',
      'margin_calls',
      'transactions',
      'notifications',
      'feedback',
      'index_prices'
    ];

    for (const table of tables) {
      try {
        // Read from source database
        const result = await client.query(`SELECT * FROM ${table}`);
        const rows = result.rows;

        if (rows.length === 0) {
          info(`No data in ${table} - skipping`);
          continue;
        }

        log(`\nMigrating ${rows.length} rows from ${table}...`, 'blue');

        // Insert into Supabase in batches
        const batchSize = 100;
        let migrated = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          
          const { error: insertError } = await supabase
            .from(table)
            .insert(batch);

          if (insertError) {
            error(`Failed to insert batch into ${table}: ${insertError.message}`);
          } else {
            migrated += batch.length;
          }
        }

        success(`${table}: ${migrated}/${rows.length} rows migrated`);
      } catch (err) {
        error(`Error migrating ${table}: ${err.message}`);
      }
    }

    success('\nPostgreSQL data migration complete');
  } catch (err) {
    error(`PostgreSQL connection error: ${err.message}`);
  } finally {
    await client.end();
  }
}

async function verifyMigration(supabase) {
  log('\n=== Verifying Migration ===\n', 'bright');

  const tables = [
    'users',
    'options',
    'trades',
    'settlements',
    'wallets',
    'margin_calls',
    'transactions',
    'notifications',
    'feedback',
    'index_prices'
  ];

  for (const table of tables) {
    try {
      const { count, error: supabaseError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (supabaseError) {
        error(`Failed to count ${table}: ${supabaseError.message}`);
      } else {
        info(`${table}: ${count} rows`);
      }
    } catch (err) {
      error(`Error verifying ${table}: ${err.message}`);
    }
  }
}

async function main() {
  log('\n╔════════════════════════════════════════╗', 'bright');
  log('║  Cropto → Supabase Migration Script  ║', 'bright');
  log('╚════════════════════════════════════════╝', 'bright');

  // Validate environment
  const env = await validateEnvironment();
  
  if (isFileDBMode) {
    info('\nValidating db.json only...');
    const db = await readFileDB();
    success(`\nValidation complete: ${db.users?.length || 0} users in db.json`);
    return;
  }

  const { supabase, databaseUrl } = env;

  try {
    // Read file database
    const db = await readFileDB();

    // Migrate users from db.json
    await migrateUsers(supabase, db.users);

    // Migrate existing PostgreSQL data
    await migratePostgresData(supabase, databaseUrl);

    // Verify migration
    await verifyMigration(supabase);

    log('\n╔════════════════════════════════════════╗', 'green');
    log('║      Migration Completed Successfully  ║', 'green');
    log('╚════════════════════════════════════════╝', 'green');
    log('\nNext steps:', 'bright');
    info('1. Update DATABASE_URL in your .env to point to Supabase');
    info('2. Remove or backup server/db.json');
    info('3. Test your application with the new database');
    info('4. Update Replit Secrets with new DATABASE_URL\n');

  } catch (err) {
    error(`\nMigration failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  error(`\nUnexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
