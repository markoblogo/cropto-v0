import { createClient } from '@supabase/supabase-js';

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'BROKER';

export interface SupabaseUser {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
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

  // SECURITY: backend must use service_role by default.
  // ANON fallback is allowed only with explicit opt-in for local/dev recovery.
  const allowAnonFallback = process.env.ALLOW_SUPABASE_ANON_BACKEND === 'true';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseKey = serviceRoleKey || (allowAnonFallback ? anonKey : undefined);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured. ' +
      'Set ALLOW_SUPABASE_ANON_BACKEND=true only for temporary local/dev fallback.'
    );
  }

  if (!serviceRoleKey && allowAnonFallback) {
    console.warn('⚠️  WARNING: Using SUPABASE_ANON_KEY for backend operations (fallback mode).');
    console.warn('   This mode is unsafe for production and should be temporary.');
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  const allowAnonFallback = process.env.ALLOW_SUPABASE_ANON_BACKEND === 'true';
  const hasSecureConfig = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasFallbackConfig = !!(process.env.SUPABASE_URL && allowAnonFallback && process.env.SUPABASE_ANON_KEY);
  return hasSecureConfig || hasFallbackConfig;
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
  role: UserRole = 'USER'
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
    .insert(newUser as any)
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
    .update(updates as any as never)
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
