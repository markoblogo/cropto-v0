import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { binanceMarketSnapshot } from "@shared/schema";
import { getBinanceMarketSnapshot } from "./binanceMarketService";

const BINANCE_INTERVAL_SEC = Number.parseInt(process.env.MONITOR_BINANCE_INTERVAL_SEC || "900", 10);
const RUN_BINANCE_JOBS_IN_WEB = process.env.RUN_BINANCE_JOBS_IN_WEB !== "false";

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
    create table if not exists binance_market_snapshot (
      id uuid primary key default gen_random_uuid(),
      ts timestamptz not null default now(),
      venue text not null default 'binance',
      symbol text not null,
      asset_type text not null,
      underlying text,
      price numeric(20,8),
      price_change_24h_pct numeric(12,6),
      volume_24h numeric(24,8),
      open_interest numeric(24,8),
      implied_volatility numeric(12,6),
      source text not null,
      status text not null default 'INDICATIVE',
      extra text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists binance_market_snapshot_ts_idx on binance_market_snapshot (ts desc);`);
  await db.execute(sql`create index if not exists binance_market_snapshot_symbol_idx on binance_market_snapshot (symbol, ts desc);`);
  tableEnsured = true;
}

export async function runBinanceSnapshotIngestionOnce(forceRefresh = true) {
  await ensureTable();
  const snapshot = await getBinanceMarketSnapshot(forceRefresh);
  const ts = new Date(snapshot.generatedAt);
  const rows = snapshot.rows.map((row) => ({
    ts,
    venue: "binance",
    symbol: row.symbol,
    assetType: row.assetType,
    underlying: row.underlying,
    price: toDecimalString(row.price),
    priceChange24hPct: toDecimalString(row.priceChange24hPct),
    volume24h: toDecimalString(row.volume24h),
    openInterest: toDecimalString(row.openInterest),
    impliedVolatility: toDecimalString(row.impliedVolatility),
    source: row.source,
    status: row.status,
    extra: safeJson({ extra: row.extra || {}, series: row.series || [] }),
  }));
  if (rows.length > 0) {
    await db.insert(binanceMarketSnapshot).values(rows);
  }
  return {
    generatedAt: snapshot.generatedAt,
    status: snapshot.status,
    rowsInserted: rows.length,
  };
}

export function startBinanceMarketScheduler() {
  if (!RUN_BINANCE_JOBS_IN_WEB) {
    console.log("[Binance] RUN_BINANCE_JOBS_IN_WEB=false; skipping in web service.");
    return;
  }
  if (timer) return;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await runBinanceSnapshotIngestionOnce(true);
      console.log(`[Binance] tick complete status=${result.status} rows=${result.rowsInserted}`);
    } catch (error: any) {
      console.error("[Binance] tick failed:", error?.message || error);
    } finally {
      inFlight = false;
    }
  };
  void tick();
  timer = setInterval(() => void tick(), Math.max(300, BINANCE_INTERVAL_SEC) * 1000);
  console.log(`[Binance] scheduler started interval=${Math.max(300, BINANCE_INTERVAL_SEC)}s`);
}

export async function getBinanceRiskTrends(hours = 168) {
  await ensureTable();
  const safeHours = Math.max(1, Math.min(24 * 30, Number.isFinite(hours) ? hours : 168));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  const symbols = ["BTCUSDT", "ETHUSDT", "PAXGUSDT", "BTC_OPTIONS_PROXY", "ETH_OPTIONS_PROXY"] as const;

  const bySymbol: Record<string, { latest: number | null; delta24h: number | null; delta7d: number | null; points: Array<{ ts: string; value: number }> }> = {};
  for (const symbol of symbols) {
    const rows = await db
      .select({
        ts: binanceMarketSnapshot.ts,
        price: binanceMarketSnapshot.price,
        iv: binanceMarketSnapshot.impliedVolatility,
      })
      .from(binanceMarketSnapshot)
      .where(and(eq(binanceMarketSnapshot.symbol, symbol), gte(binanceMarketSnapshot.ts, since)))
      .orderBy(binanceMarketSnapshot.ts);

    const points = rows
      .map((row) => {
        const raw = symbol.endsWith("_PROXY") ? row.iv : row.price;
        const value = Number.parseFloat(String(raw || ""));
        return {
          ts: row.ts ? new Date(row.ts).toISOString() : new Date().toISOString(),
          value,
        };
      })
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
      ts: binanceMarketSnapshot.ts,
      symbol: binanceMarketSnapshot.symbol,
      status: binanceMarketSnapshot.status,
      priceChange24hPct: binanceMarketSnapshot.priceChange24hPct,
      impliedVolatility: binanceMarketSnapshot.impliedVolatility,
    })
    .from(binanceMarketSnapshot)
    .orderBy(desc(binanceMarketSnapshot.ts))
    .limit(40);

  const latestTs = latestRows[0]?.ts ? Date.parse(String(latestRows[0].ts)) : Date.now();
  const latestMap = new Map<string, any>();
  for (const row of latestRows) {
    const ts = row.ts ? Date.parse(String(row.ts)) : 0;
    if (Math.abs(ts - latestTs) > 2 * 60 * 1000) continue;
    if (!latestMap.has(row.symbol)) latestMap.set(row.symbol, row);
  }
  const btcChange = Number.parseFloat(String(latestMap.get("BTCUSDT")?.priceChange24hPct || "0"));
  const ethChange = Number.parseFloat(String(latestMap.get("ETHUSDT")?.priceChange24hPct || "0"));
  const btcIv = Number.parseFloat(String(latestMap.get("BTC_OPTIONS_PROXY")?.impliedVolatility || "0"));
  const ethIv = Number.parseFloat(String(latestMap.get("ETH_OPTIONS_PROXY")?.impliedVolatility || "0"));
  const avgAbsMove = (Math.abs(btcChange) + Math.abs(ethChange)) / 2;
  const avgIv = (btcIv + ethIv) / 2;
  const macroRiskScore = Number((100 * (0.55 * Math.min(1, avgIv / 1.2) + 0.45 * Math.min(1, avgAbsMove / 8))).toFixed(2));

  return {
    generatedAt: new Date().toISOString(),
    hours: safeHours,
    bySymbol,
    macroRisk: {
      score: Number.isFinite(macroRiskScore) ? macroRiskScore : null,
      avgIv: Number.isFinite(avgIv) ? Number(avgIv.toFixed(4)) : null,
      avgAbsMove: Number.isFinite(avgAbsMove) ? Number(avgAbsMove.toFixed(4)) : null,
    },
  };
}
