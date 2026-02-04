import { createClient } from '@supabase/supabase-js';

async function createUsersTable() {
  console.log('🚀 Creating users table in Supabase with RLS...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    console.error('\n💡 Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n' + getSQLSchema());
    process.exit(1);
  }

  console.log('✅ Supabase credentials found');
  console.log(`URL: ${supabaseUrl}\n`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Try to create table using raw SQL
  const sql = getSQLSchema();
  
  console.log('📝 Executing SQL schema...\n');
  
  try {
    // Execute each statement separately
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (!statement.trim()) continue;
      
      console.log(`Executing: ${statement.substring(0, 50).trim()}...`);
      
      // Use rpc if available, otherwise fallback to direct SQL
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        // If rpc not available, we need manual execution
        if (error.code === '42883') {
          console.log('\n⚠️  RPC function not available. Please run this SQL manually:\n');
          console.log(getSQLSchema());
          console.log('\n📖 Instructions:');
          console.log('1. Go to Supabase Dashboard → SQL Editor');
          console.log('2. Paste the SQL above');
          console.log('3. Click "Run"');
          console.log('4. Then run: npx tsx scripts/migrateToSupabase.ts\n');
          process.exit(1);
        }
        throw error;
      }
    }
    
    console.log('\n✅ Users table created successfully with RLS!');
    console.log('\n📝 Next step: Run migration to copy users from db.json');
    console.log('   npx tsx scripts/migrateToSupabase.ts\n');
    
  } catch (error: any) {
    console.error('\n❌ Error creating table:', error.message);
    console.log('\n💡 Please run this SQL manually in Supabase SQL Editor:\n');
    console.log(getSQLSchema());
    console.log('\n📖 Instructions:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Paste the SQL above');
    console.log('3. Click "Run"');
    console.log('4. Then run: npx tsx scripts/migrateToSupabase.ts\n');
    process.exit(1);
  }
}

function getSQLSchema(): string {
  return `
-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('farmer', 'trader', 'broker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address VARCHAR(255),
  network VARCHAR(50)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Enforce RLS
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Never expose this table directly via PostgREST
REVOKE ALL ON TABLE public.users FROM anon, authenticated;

-- RLS Policy: Backend service role only
DROP POLICY IF EXISTS "Service role has full access" ON public.users;
CREATE POLICY "Service role has full access" ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.users IS 'User authentication and profile data with RLS';
COMMENT ON POLICY "Service role has full access" ON public.users IS 'Backend service using service_role key has full access';
`.trim();
}

createUsersTable().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
