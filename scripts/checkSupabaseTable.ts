import { createClient } from '@supabase/supabase-js';

async function checkTable() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 Checking users table in Supabase...\n');
  
  // Try to query users table
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('❌ Table check failed:', error.code, error.message);
    
    if (error.code === 'PGRST204' || error.message.includes('does not exist') || error.message.includes('schema cache')) {
      console.log('\n⚠️  Users table does NOT exist in Supabase');
      console.log('Please create it manually in Supabase SQL Editor');
      process.exit(1);
    } else {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  } else {
    console.log('✅ Users table EXISTS in Supabase!');
    console.log(`   Current rows: ${data?.length || 0}`);
    
    if (data && data.length > 0) {
      console.log('\n📋 Sample data:');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('\n📋 Table is empty - ready for migration!');
    }
    
    process.exit(0);
  }
}

checkTable();
