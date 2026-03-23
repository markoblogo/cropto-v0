import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { globalIndexSnapshot } from "@shared/schema";
import { getGlobalIndicesSnapshot } from "./globalIndicesService";

const GLOBAL_INDICES_INTERVAL_SEC = Number.parseInt(process.env.MONITOR_GLOBAL_INDICES_INTERVAL_SEC || "1800", 10);
const RUN_GLOBAL_INDICES_JOBS_IN_WEB = process.env.RUN_GLOBAL_INDICES_JOBS_IN_WEB !== "false";

let timer: NodeJS.Timeout | null = null;
let inFlight = false;
let tableEnsured = false;

function toDecimalString(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return String(Number(value.toFixed(8)));
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

async function ensureTable() {
  if (tableEnsured) return;
  await db.execute(sql`
    create table if not exists global_index_snapshot (
      id uuid primary key default gen_random_uuid(),
      ts timestamptz not null default now(),
      provider text not null,
      symbol text not null,
      name text not null,
      region text not null,
      value numeric(20,8),
      day_change_pct numeric(12,6),
      source text not null default 'eod',
      status text not null default 'INDICATIVE',
      extra text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists global_index_snapshot_ts_idx on global_index_snapshot (ts desc);`);
  await db.execute(sql`create index if not exists global_index_snapshot_symbol_idx on global_index_snapshot (symbol, ts desc);`);
  tableEnsured = true;
}

export async function runGlobalIndicesIngestionOnce(forceRefresh = true) {
  await ensureTable();
  const snapshot = await getGlobalIndicesSnapshot(forceRefresh);
  const ts = new Date(snapshot.generatedAt);
  const rows = snapshot.rows.map((row) => ({
    ts,
    provider: row.provider,
    symbol: row.symbol,
    name: row.name,
    region: row.region,
    value: toDecimalString(row.value),
    dayChangePct: toDecimalString(row.dayChangePct),
    source: row.source,
    status: row.status,
    extra: safeJson({
      note: row.note,
      series: row.series || [],
      providerMode: snapshot.providerMode,
      riskRegime: snapshot.riskOnOff.regime,
      crossAsset: snapshot.crossAsset,
    }),
  }));
  if (rows.length > 0) {
    await db.insert(globalIndexSnapshot).values(rows);
  }
  return {
    generatedAt: snapshot.generatedAt,
    status: snapshot.status,
    providerMode: snapshot.providerMode,
    rowsInserted: rows.length,
  };
}

export function startGlobalIndicesScheduler() {
  if (!RUN_GLOBAL_INDICES_JOBS_IN_WEB) {
    console.log("[GlobalIndices] RUN_GLOBAL_INDICES_JOBS_IN_WEB=false; skipping in web service.");
    return;
  }
  if (timer) return;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await runGlobalIndicesIngestionOnce(true);
      console.log(`[GlobalIndices] tick complete status=${result.status} mode=${result.providerMode} rows=${result.rowsInserted}`);
    } catch (error: any) {
      console.error("[GlobalIndices] tick failed:", error?.message || error);
    } finally {
      inFlight = false;
    }
  };
  void tick();
  timer = setInterval(() => void tick(), Math.max(300, GLOBAL_INDICES_INTERVAL_SEC) * 1000);
  console.log(`[GlobalIndices] scheduler started interval=${Math.max(300, GLOBAL_INDICES_INTERVAL_SEC)}s`);
}

export async function getGlobalIndexTrends(hours = 168) {
  await ensureTable();
  const safeHours = Math.max(1, Math.min(24 * 30, Number.isFinite(hours) ? hours : 168));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  const symbols = ["SPX", "IXIC", "DJI", "DAX", "CAC40", "STOXX50E", "MXEF", "BVSP", "MERV"] as const;

  const bySymbol: Record<string, { latest: number | null; delta24h: number | null; delta7d: number | null; points: Array<{ ts: string; value: number }> }> = {};

  for (const symbol of symbols) {
    const rows = await db
      .select({
        ts: globalIndexSnapshot.ts,
        value: globalIndexSnapshot.value,
        dayChangePct: globalIndexSnapshot.dayChangePct,
      })
      .from(globalIndexSnapshot)
      .where(and(eq(globalIndexSnapshot.symbol, symbol), gte(globalIndexSnapshot.ts, since)))
      .orderBy(globalIndexSnapshot.ts);

    const points = rows
      .map((row) => ({
        ts: row.ts ? new Date(row.ts).toISOString() : new Date().toISOString(),
        value: Number.parseFloat(String(row.value || "")),
      }))
      .filter((point) => Number.isFinite(point.value));
    const latest = points.length ? points[points.length - 1].value : null;

    const nearest = (target: number) => {
      let candidate: { ts: string; value: number } | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const point of points) {
        const d = Math.abs(Date.parse(point.ts) - target);
        if (d < best) {
          best = d;
          candidate = point;
        }
      }
      return candidate;
    };
    const ref24 = nearest(Date.now() - 24 * 60 * 60 * 1000);
    const ref7d = nearest(Date.now() - 7 * 24 * 60 * 60 * 1000);
    bySymbol[symbol] = {
      latest,
      delta24h: latest != null && ref24 ? Number((latest - ref24.value).toFixed(4)) : null,
      delta7d: latest != null && ref7d ? Number((latest - ref7d.value).toFixed(4)) : null,
      points,
    };
  }

  const latestRows = await db
    .select({
      ts: globalIndexSnapshot.ts,
      status: globalIndexSnapshot.status,
      provider: globalIndexSnapshot.provider,
    })
    .from(globalIndexSnapshot)
    .orderBy(desc(globalIndexSnapshot.ts))
    .limit(1);

  return {
    generatedAt: new Date().toISOString(),
    hours: safeHours,
    bySymbol,
    status: (latestRows[0]?.status || "INDICATIVE").toUpperCase(),
    provider: latestRows[0]?.provider || "unknown",
  };
}
