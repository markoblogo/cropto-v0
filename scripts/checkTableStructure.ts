import { createClient } from '@supabase/supabase-js';

async function checkStructure() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 Checking users table structure...\n');
  
  // Insert a test record to see which fields are accepted
  const testUser = {
    id: 'test_structure_check',
    email: 'test@structure.check',
    password_hash: 'test_hash',
    role: 'farmer',
    created_at: new Date().toISOString(),
    wallet_address: '0x1234567890123456789012345678901234567890',
    network: 'amoy'
  };
  
  const { data, error } = await supabase
    .from('users')
    .insert(testUser)
    .select();
  
  if (error) {
    console.log('❌ Insert test failed:', error.message);
    console.log('\n📋 Error details:', error);
    
    // Try without optional fields
    console.log('\n🔄 Trying without wallet_address and network...');
    const minimalUser = {
      id: 'test_structure_check',
      email: 'test@structure.check',
      password_hash: 'test_hash',
      role: 'farmer',
      created_at: new Date().toISOString()
    };
    
    const { data: data2, error: error2 } = await supabase
      .from('users')
      .insert(minimalUser)
      .select();
    
    if (error2) {
      console.log('❌ Still failed:', error2.message);
      process.exit(1);
    } else {
      console.log('✅ Success with minimal fields!');
      console.log('\n📋 Table structure (missing):');
      console.log('   - wallet_address');
      console.log('   - network');
      console.log('\n💡 These columns need to be added to Supabase table');
      
      // Cleanup
      await supabase.from('users').delete().eq('id', 'test_structure_check');
      process.exit(0);
    }
  } else {
    console.log('✅ All fields accepted!');
    console.log('\n📋 Table structure is complete:');
    console.log(JSON.stringify(data[0], null, 2));
    
    // Cleanup
    await supabase.from('users').delete().eq('id', 'test_structure_check');
    process.exit(0);
  }
}

checkStructure();
