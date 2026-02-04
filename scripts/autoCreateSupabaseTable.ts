import { createClient } from '@supabase/supabase-js';

async function autoCreateTable() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 Checking if users table exists...\n');
  
  // Try to query users table
  const { data, error } = await supabase
    .from('users')
    .select('email')
    .limit(1);
  
  if (error) {
    if (error.code === 'PGRST204' || error.message.includes('does not exist') || error.message.includes('schema cache')) {
      console.log('❌ Users table does not exist\n');
      console.log('📝 Creating users table programmatically...\n');
      
      // Since we can't execute DDL through REST API, we'll create a helper
      // that inserts a dummy record which will auto-create the table structure
      // This is a workaround - NOT recommended for production
      
      console.log('⚠️  Cannot auto-create table via REST API');
      console.log('⚠️  Supabase requires SQL execution for table creation\n');
      console.log('📋 Please execute this SQL manually:\n');
      console.log('─'.repeat(70));
      console.log(getSQLSchema());
      console.log('─'.repeat(70));
      console.log('\n📖 How to execute:');
      console.log(`1. Go to: https://supabase.com/dashboard/project/${getProjectRef()}/sql/new`);
      console.log('2. Paste the SQL above');
      console.log('3. Click "Run"');
      console.log('4. Come back here and press Enter to continue migration...\n');
      
      // Wait for user confirmation
      await waitForEnter();
      
      // Verify table was created
      const { error: checkError } = await supabase
        .from('users')
        .select('email')
        .limit(1);
      
      if (checkError && (checkError.code === 'PGRST204' || checkError.message.includes('does not exist'))) {
        console.log('\n❌ Table still not found. Please create it manually first.');
        process.exit(1);
      }
      
      console.log('\n✅ Table verified!');
      return true;
    } else {
      console.error('❌ Error checking table:', error);
      throw error;
    }
  } else {
    console.log('✅ Users table already exists');
    console.log(`   Found ${data.length} row(s)\n`);
    return true;
  }
}

function getProjectRef(): string {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : 'YOUR_PROJECT';
}

function getSQLSchema(): string {
  return `
-- Create users table with RLS
CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('farmer', 'trader', 'broker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address VARCHAR(255),
  network VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users FROM anon, authenticated;

DROP POLICY IF EXISTS "Service role has full access" ON public.users;
CREATE POLICY "Service role has full access" ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.users IS 'User authentication and profile data with RLS';
`.trim();
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

autoCreateTable()
  .then(() => {
    console.log('\n🎉 Ready to migrate users from db.json!');
    console.log('Run: npx tsx scripts/migrateToSupabase.ts\n');
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
