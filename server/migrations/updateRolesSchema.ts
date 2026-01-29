// @ts-nocheck

/**
 * Migration script to update user roles from old system to new RBAC
 * Old roles: 'farmer' | 'trader' | 'broker'
 * New roles: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
 * 
 * Run with: tsx server/migrations/updateRolesSchema.ts
 */

import { getSupabaseClient, isSupabaseConfigured } from '../db/supabase';

async function updateRolesSchema() {
  if (!isSupabaseConfigured()) {
    console.log('❌ Supabase not configured. This migration only works with Supabase.');
    console.log('   For file-based DB, manually update server/db.json');
    return;
  }

  const client = getSupabaseClient();

  console.log('🔄 Starting role migration...\n');

  try {
    // Step 1: Check current schema
    console.log('Step 1: Checking current role column type...');
    const { data: tableInfo, error: tableError } = await client
      .from('users')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error('Error accessing users table:', tableError);
      throw tableError;
    }

    console.log('✓ Users table accessible\n');

    // Step 2: Update all existing users to new role system
    console.log('Step 2: Migrating existing user roles...');
    
    // Get all users
    const { data: users, error: usersError } = await client
      .from('users')
      .select('id, email, role');

    if (usersError) {
      throw usersError;
    }

    console.log(`   Found ${users?.length || 0} users to migrate`);

    // Map old roles to new roles
    const roleMapping: { [key: string]: 'USER' | 'ADMIN' | 'SUPER_ADMIN' } = {
      'farmer': 'USER',
      'trader': 'USER',
      'broker': 'ADMIN',
    };

    // Update each user
    for (const user of users || []) {
      const newRole = roleMapping[user.role as string] || 'USER';
      
      const { error: updateError } = await client
        .from('users')
        .update({ role: newRole })
        .eq('id', user.id);

      if (updateError) {
        console.error(`   ✗ Failed to update ${user.email}: ${updateError.message}`);
      } else {
        console.log(`   ✓ ${user.email}: ${user.role} → ${newRole}`);
      }
    }

    console.log('\n✓ Role migration complete\n');

    // Step 3: Set a.biletskiy@gmail.com as SUPER_ADMIN
    console.log('Step 3: Setting a.biletskiy@gmail.com as SUPER_ADMIN...');
    
    const { data: superAdminUser, error: superAdminError } = await client
      .from('users')
      .update({ role: 'SUPER_ADMIN' })
      .eq('email', 'a.biletskiy@gmail.com')
      .select();

    if (superAdminError) {
      console.log('   ⚠️  User a.biletskiy@gmail.com not found or error:', superAdminError.message);
    } else if (superAdminUser && superAdminUser.length > 0) {
      console.log('   ✓ a.biletskiy@gmail.com set as SUPER_ADMIN\n');
    } else {
      console.log('   ⚠️  User a.biletskiy@gmail.com not found in database\n');
    }

    // Step 4: Show summary
    console.log('Step 4: Summary of current roles...');
    const { data: finalUsers, error: finalError } = await client
      .from('users')
      .select('email, role')
      .order('role', { ascending: true });

    if (!finalError && finalUsers) {
      console.log('\nCurrent users:');
      finalUsers.forEach(u => {
        console.log(`   ${u.email}: ${u.role}`);
      });
    }

    console.log('\n✅ Migration completed successfully!\n');
    console.log('Note: The role column type in Supabase should be changed to:');
    console.log('   ALTER TABLE users ALTER COLUMN role TYPE text;');
    console.log('   (Supabase will allow any text value, we enforce enum in TypeScript)\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
updateRolesSchema().then(() => {
  console.log('Exiting...');
  process.exit(0);
});
