import * as dotenv from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const shouldUseSsl =
  process.env.PGSSLMODE === "require" ||
  /sslmode=require/i.test(connectionString) ||
  /supabase\.co/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS ?? 10_000),
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_TIMEOUT_MS ?? 5_000),
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("[DB] Pool error", err);
});

export const db = drizzle(pool, { schema });
