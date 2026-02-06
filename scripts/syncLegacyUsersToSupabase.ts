import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

type DbRole = string;
type SupabaseRole = "USER" | "ADMIN" | "SUPER_ADMIN" | "BROKER";

interface LegacyUser {
  id: string;
  email: string;
  passwordHash: string;
  role: DbRole;
  createdAt: string;
  walletAddress?: string;
  network?: string;
}

interface LegacyDb {
  users?: LegacyUser[];
}

function normalizeRole(rawRole: DbRole | undefined): SupabaseRole {
  const role = (rawRole || "USER").toLowerCase();
  if (role === "broker") return "BROKER";
  if (role === "admin") return "ADMIN";
  if (role === "super_admin") return "SUPER_ADMIN";
  return "USER";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseFlags() {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
  };
}

async function run() {
  const { dryRun } = parseFlags();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const dbPath = path.join(process.cwd(), "server", "db.json");
  const raw = await fs.readFile(dbPath, "utf-8");
  const parsed = JSON.parse(raw) as LegacyDb;
  const users = parsed.users || [];

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  console.log(`[syncLegacyUsersToSupabase] source users: ${users.length}`);
  if (dryRun) {
    console.log("[syncLegacyUsersToSupabase] running in --dry-run mode");
  }

  let inserted = 0;
  let skipped = 0;
  let invalid = 0;
  let failed = 0;

  for (const legacy of users) {
    const email = normalizeEmail(legacy.email || "");
    if (!email || !legacy.passwordHash) {
      console.warn(`[skip:invalid] id=${legacy.id} email="${legacy.email}"`);
      invalid += 1;
      continue;
    }

    const { data: existing, error: existingErr } = await supabase
      .from("users")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (existingErr) {
      console.error(`[error:lookup] email=${email} ${existingErr.message}`);
      failed += 1;
      continue;
    }

    if (existing) {
      console.log(`[skip:exists] email=${email}`);
      skipped += 1;
      continue;
    }

    const row = {
      id: legacy.id,
      email,
      password_hash: legacy.passwordHash,
      role: normalizeRole(legacy.role),
      created_at: legacy.createdAt || new Date().toISOString(),
      wallet_address: legacy.walletAddress || null,
      network: legacy.network || null,
    };

    if (dryRun) {
      console.log(`[dry-run:insert] email=${email} role=${row.role}`);
      inserted += 1;
      continue;
    }

    const { error: insertErr } = await supabase.from("users").insert(row as never);
    if (insertErr) {
      console.error(`[error:insert] email=${email} ${insertErr.message}`);
      failed += 1;
      continue;
    }

    console.log(`[inserted] email=${email} role=${row.role}`);
    inserted += 1;
  }

  console.log("----- sync summary -----");
  console.log(`inserted=${inserted}`);
  console.log(`skipped=${skipped}`);
  console.log(`invalid=${invalid}`);
  console.log(`failed=${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("[syncLegacyUsersToSupabase] fatal:", error);
  process.exit(1);
});

