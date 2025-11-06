# Supabase Migration Guide

This guide explains how to migrate user authentication from file-based storage (`db.json`) to Supabase.

## Prerequisites

1. **Supabase Account**: Create a free account at https://supabase.com
2. **Supabase Project**: Create a new project in your Supabase dashboard
3. **Credentials**: Get your project URL and anon key from Settings → API

## Step 1: Set Up Supabase Schema

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the following SQL to create the users table:

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('farmer', 'trader', 'broker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wallet_address VARCHAR(255),
  network VARCHAR(50)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
-- Adjust this policy based on your security requirements
CREATE POLICY "Allow all operations on users" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

4. Click **Run** to execute the SQL

**Note**: The SQL script is also available in `scripts/supabase-schema.sql`

## Step 2: Configure Environment Variables

Add these secrets to your Replit project (Secrets tab):

```bash
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

You can find these values in your Supabase project:
- Settings → API → Project URL
- Settings → API → Project API keys → `anon` `public`

## Step 3: Run Migration Script

The migration script will copy all users from `db.json` to Supabase:

```bash
npx tsx scripts/migrateToSupabase.ts
```

### What the script does:

1. ✅ Reads all users from `server/db.json`
2. ✅ Connects to Supabase using your credentials
3. ✅ For each user:
   - Checks if user already exists (by email)
   - Skips if already migrated
   - Creates new user record with:
     - Same ID
     - Same email and password hash
     - Same role (farmer/trader/broker)
     - Same creation date
     - Wallet address and network (if set)
4. ✅ Displays summary report

### Expected output:

```
🚀 Starting migration from db.json to Supabase...

✅ Supabase credentials found
URL: https://xxxxxxxxxxx.supabase.co

📖 Reading users from /path/to/server/db.json...
Found 7 users to migrate

✅ Migrated farmer@demo (farmer)
✅ Migrated trader@demo (trader)
✅ Migrated broker@demo (broker)
⏭️  Skipping test@example.com (already exists)

==================================================
📊 Migration Summary:
==================================================
Total users:     7
✅ Migrated:     6
⏭️  Skipped:     1
❌ Errors:       0
==================================================

🎉 Migration completed successfully!

📝 Next steps:
1. Verify users in Supabase dashboard
2. Test login with migrated users
3. Keep db.json as backup
```

## Step 4: Verify Migration

### Check Supabase Dashboard

1. Go to Supabase → **Table Editor** → **users**
2. Verify all users are present
3. Check that emails, roles, and other fields are correct

### Test Authentication

The application automatically uses Supabase when `SUPABASE_URL` is configured.

Test login with existing users:

```bash
# Using curl
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"farmer@demo","password":"pass"}'
```

Expected response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_...",
    "email": "farmer@demo",
    "role": "farmer",
    ...
  }
}
```

### Test User Registration

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "securePassword123",
    "role": "trader"
  }'
```

New users will be created in Supabase automatically.

## How DB_MODE Works

The application automatically switches between storage backends:

```typescript
// server/auth.ts
function useSupabase(): boolean {
  return isSupabaseConfigured(); // checks if SUPABASE_URL is set
}
```

**With SUPABASE_URL configured:**
- ✅ All user operations use Supabase
- ✅ `db.json` is ignored for user authentication
- ✅ New users are created in Supabase
- ✅ Login, registration, wallet updates all use Supabase

**Without SUPABASE_URL:**
- ✅ Falls back to file-based `db.json`
- ✅ Works exactly as before
- ✅ No code changes needed

## Rollback Plan

If you need to rollback to file-based storage:

1. **Remove or comment out** the Supabase environment variables:
   ```bash
   # SUPABASE_URL=...
   # SUPABASE_ANON_KEY=...
   ```

2. **Restart the application**
   - System automatically falls back to `db.json`

3. **Keep `db.json` as backup** - don't delete it!

## Troubleshooting

### Error: "SUPABASE_URL and SUPABASE_ANON_KEY must be configured"

**Solution**: Add both environment variables to Replit Secrets

### Error: "relation 'users' does not exist"

**Solution**: Run the SQL schema script in Supabase SQL Editor (Step 1)

### Error: "duplicate key value violates unique constraint"

**Solution**: User already exists. The migration script will skip them automatically.

### Users can't login after migration

**Checklist:**
1. ✅ Verify SUPABASE_URL and SUPABASE_ANON_KEY are set
2. ✅ Check Supabase Table Editor - users should be visible
3. ✅ Verify RLS policy allows operations
4. ✅ Check server logs for errors
5. ✅ Test with `curl` to see exact error message

### Migration script hangs or times out

**Solution**: 
- Check your internet connection
- Verify Supabase credentials are correct
- Try migrating users in smaller batches

## Security Considerations

### Row Level Security (RLS)

The default policy allows all operations. For production, consider restricting access:

```sql
-- Remove permissive policy
DROP POLICY "Allow all operations on users" ON users;

-- Add more restrictive policies
-- Example: Users can only read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT
  USING (auth.uid()::text = id);
```

### Password Hashing

- Passwords are hashed with bcrypt (10 rounds)
- Password hashes are migrated as-is from `db.json`
- Users can continue using their existing passwords

### API Keys

- Use `SUPABASE_ANON_KEY` (public key) for client-side operations
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code
- Store all keys in Replit Secrets, never in code

## Performance Notes

### Indexes

The schema includes indexes on:
- `email` - for fast login lookups
- `role` - for filtering users by role

### Connection Pooling

Supabase client automatically handles connection pooling.

### Caching

Consider implementing caching for frequently accessed user data to reduce database queries.

## Migration Checklist

- [ ] Create Supabase project
- [ ] Run SQL schema script
- [ ] Add SUPABASE_URL to Replit Secrets
- [ ] Add SUPABASE_ANON_KEY to Replit Secrets
- [ ] Run migration script
- [ ] Verify users in Supabase dashboard
- [ ] Test login with existing users
- [ ] Test registration of new users
- [ ] Test wallet linking
- [ ] Keep db.json as backup
- [ ] Update production environment variables

## Support

For issues or questions:
1. Check Supabase documentation: https://supabase.com/docs
2. Review server logs for errors
3. Test with curl to isolate issues
4. Check Supabase dashboard for data verification
