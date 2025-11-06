import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

interface FileUser {
  id: string;
  email: string;
  passwordHash: string;
  role: 'farmer' | 'trader' | 'broker';
  createdAt: string;
  walletAddress?: string;
  network?: string;
}

interface FileDB {
  users: FileUser[];
}

async function migrateToSupabase() {
  console.log('🚀 Starting migration from db.json to Supabase...\n');

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment');
    console.error('Please add these to your Replit Secrets.');
    process.exit(1);
  }

  console.log('✅ Supabase credentials found');
  console.log(`URL: ${supabaseUrl}\n`);

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read db.json
  const dbPath = path.join(process.cwd(), 'server', 'db.json');
  console.log(`📖 Reading users from ${dbPath}...`);

  let fileDB: FileDB;
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    fileDB = JSON.parse(data);
  } catch (error) {
    console.error('❌ Error reading db.json:', error);
    process.exit(1);
  }

  const users = fileDB.users || [];
  console.log(`Found ${users.length} users to migrate\n`);

  if (users.length === 0) {
    console.log('⚠️  No users to migrate');
    process.exit(0);
  }

  // Migrate each user
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // Check if user already exists
      const { data: existing } = await supabase
        .from('users')
        .select('email')
        .eq('email', user.email)
        .single();

      if (existing) {
        console.log(`⏭️  Skipping ${user.email} (already exists)`);
        skipCount++;
        continue;
      }

      // Insert user
      const { error } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          password_hash: user.passwordHash,
          role: user.role,
          created_at: user.createdAt,
          wallet_address: user.walletAddress || null,
          network: user.network || null,
        });

      if (error) {
        console.error(`❌ Error migrating ${user.email}:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ Migrated ${user.email} (${user.role})`);
        successCount++;
      }
    } catch (error: any) {
      console.error(`❌ Error processing ${user.email}:`, error.message);
      errorCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary:');
  console.log('='.repeat(50));
  console.log(`Total users:     ${users.length}`);
  console.log(`✅ Migrated:     ${successCount}`);
  console.log(`⏭️  Skipped:      ${skipCount}`);
  console.log(`❌ Errors:       ${errorCount}`);
  console.log('='.repeat(50));

  if (errorCount > 0) {
    console.log('\n⚠️  Migration completed with errors');
    process.exit(1);
  } else {
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Verify users in Supabase dashboard');
    console.log('2. Test login with migrated users');
    console.log('3. Keep db.json as backup');
    process.exit(0);
  }
}

migrateToSupabase().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
