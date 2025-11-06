import { createClient } from '@supabase/supabase-js';

export interface SupabaseUser {
  id: string;
  email: string;
  password_hash: string;
  role: 'farmer' | 'trader' | 'broker';
  created_at: string;
  wallet_address?: string;
  network?: string;
}

let supabase: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (supabase) {
    return supabase;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  
  // SECURITY: Prefer service_role key for backend operations
  // This key has full access and bypasses RLS policies
  // NEVER expose this key to the client!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY must be configured');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️  WARNING: Using SUPABASE_ANON_KEY for backend operations.');
    console.warn('   This is INSECURE in production as it exposes user data including password hashes.');
    console.warn('   Add SUPABASE_SERVICE_ROLE_KEY to Replit Secrets for secure production deployment.');
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
}

export async function findUserByEmailSupabase(email: string): Promise<SupabaseUser | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data as SupabaseUser;
}

export async function createUserSupabase(
  email: string,
  passwordHash: string,
  role: 'farmer' | 'trader' | 'broker'
): Promise<SupabaseUser> {
  const client = getSupabaseClient();

  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('users')
    .insert(newUser)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseUser;
}

export async function updateUserSupabase(
  email: string,
  updates: Partial<SupabaseUser>
): Promise<SupabaseUser> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('users')
    .update(updates)
    .eq('email', email)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseUser;
}

export async function getAllUsersSupabase(): Promise<SupabaseUser[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data as SupabaseUser[];
}

export async function initializeSupabaseSchema() {
  const client = getSupabaseClient();

  const { error } = await client.rpc('create_users_table_if_not_exists');
  
  if (error && error.code !== '42883') {
    console.error('Supabase schema initialization error:', error);
  }
}
