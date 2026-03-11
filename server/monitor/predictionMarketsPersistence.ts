import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { macroPredictionMarkets, macroRiskTimeseries } from "@shared/schema";
import type { CanonicalMarket, PredictionMarketsPayload } from "./predictionMarketsService";
import { getPredictionMarketsDetailedSnapshot } from "./predictionMarketsService";

const PREDICTION_INTERVAL_SEC = Number.parseInt(process.env.MONITOR_PREDICTION_INTERVAL_SEC || "600", 10);
const RUN_PREDICTION_JOBS_IN_WEB = process.env.RUN_PREDICTION_JOBS_IN_WEB !== "false";

let timer: NodeJS.Timeout | null = null;
let inFlight = false;
let tablesEnsured = false;

function toDecimalString(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(6)));
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

async function ensurePredictionTables() {
  if (tablesEnsured) return;
  await db.execute(sql`
    create table if not exists macro_prediction_markets (
      id text primary key,
      source text not null,
      market_type text not null default 'binary',
      question text not null,
      description text,
      category text not null default 'other',
      tags text,
      region text not null default 'GLOBAL',
      implied_probability numeric(10,6),
      yes_price numeric(10,6),
      no_price numeric(10,6),
      volume_24h numeric(20,4),
      open_interest numeric(20,4),
      liquidity_score numeric(10,6),
      status text not null default 'open',
      close_time timestamptz,
      resolve_time timestamptz,
      raw text,
      scraped_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists macro_prediction_markets_category_idx on macro_prediction_markets (category);`);
  await db.execute(sql`create index if not exists macro_prediction_markets_region_idx on macro_prediction_markets (region);`);
  await db.execute(sql`create index if not exists macro_prediction_markets_status_idx on macro_prediction_markets (status);`);
  await db.execute(sql`create index if not exists macro_prediction_markets_updated_idx on macro_prediction_markets (updated_at desc);`);
  await db.execute(sql`
    create table if not exists macro_risk_timeseries (
      id uuid primary key default gen_random_uuid(),
      ts timestamptz not null default now(),
      source text not null default 'prediction_markets',
      index_name text not null,
      region text not null default 'GLOBAL',
      value numeric(10,6) not null,
      details text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists macro_risk_timeseries_idx on macro_risk_timeseries (index_name, region, ts desc);`);
  tablesEnsured = true;
}

function indexRegionForKey(key: string): string {
  if (key.includes("_US")) return "US";
  if (key.includes("_EU")) return "EU";
  return "GLOBAL";
}

export async function persistPredictionMarketsSnapshot(snapshot: { payload: PredictionMarketsPayload; markets: CanonicalMarket[] }) {
  const { payload, markets } = snapshot;
  const now = new Date();
  await ensurePredictionTables();

  if (markets.length > 0) {
    await db
      .insert(macroPredictionMarkets)
      .values(
        markets.map((market) => ({
          id: market.id,
          source: market.source,
          marketType: "binary",
          question: market.question,
          description: market.description || null,
          category: market.category,
          tags: safeJson(market.tags || []),
          region: market.region || "GLOBAL",
          impliedProbability: toDecimalString(market.impliedProbability),
          yesPrice: toDecimalString(market.yesPrice),
          noPrice: toDecimalString(market.noPrice),
          volume24h: toDecimalString(market.volume24h),
          openInterest: toDecimalString(market.openInterest),
          liquidityScore: toDecimalString(market.liquidityScore),
          status: market.status,
          closeTime: toDate(market.closeTime),
          resolveTime: null,
          raw: safeJson(market),
          scrapedAt: toDate(market.scrapedAt) || now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: macroPredictionMarkets.id,
        set: {
          source: sql`excluded.source`,
          marketType: sql`excluded.market_type`,
          question: sql`excluded.question`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          tags: sql`excluded.tags`,
          region: sql`excluded.region`,
          impliedProbability: sql`excluded.implied_probability`,
          yesPrice: sql`excluded.yes_price`,
          noPrice: sql`excluded.no_price`,
          volume24h: sql`excluded.volume_24h`,
          openInterest: sql`excluded.open_interest`,
          liquidityScore: sql`excluded.liquidity_score`,
          status: sql`excluded.status`,
          closeTime: sql`excluded.close_time`,
          resolveTime: sql`excluded.resolve_time`,
          raw: sql`excluded.raw`,
          scrapedAt: sql`excluded.scraped_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  const rowsToInsert = (payload.indices || [])
    .filter((row) => row.value != null && Number.isFinite(row.value))
    .map((row) => ({
      ts: now,
      source: "prediction_markets",
      indexName: row.key,
      region: indexRegionForKey(row.key),
      value: toDecimalString(row.value),
      details: safeJson({
        label: row.label,
        contributors: row.contributors,
        totalWeight: row.totalWeight,
        marketCount: payload.marketCount,
        cacheHit: payload.cacheHit,
      }),
    }));

  if (rowsToInsert.length > 0) {
    await db.insert(macroRiskTimeseries).values(rowsToInsert);
  }

  return {
    marketsUpserted: markets.length,
    riskRowsInserted: rowsToInsert.length,
  };
}

export async function runPredictionMarketsIngestionOnce(forceRefresh = true) {
  const snapshot = await getPredictionMarketsDetailedSnapshot(forceRefresh);
  const persisted = await persistPredictionMarketsSnapshot(snapshot);
  return {
    generatedAt: snapshot.payload.generatedAt,
    marketCount: snapshot.payload.marketCount,
    ...persisted,
  };
}

export function startPredictionMarketsScheduler() {
  if (!RUN_PREDICTION_JOBS_IN_WEB) {
    console.log("[PredictionMarkets] RUN_PREDICTION_JOBS_IN_WEB=false; skipping in web service.");
    return;
  }
  if (timer) return;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await runPredictionMarketsIngestionOnce(true);
      console.log(
        `[PredictionMarkets] tick complete markets=${result.marketCount} upserted=${result.marketsUpserted} riskRows=${result.riskRowsInserted}`,
      );
    } catch (error: any) {
      console.error("[PredictionMarkets] tick failed:", error?.message || error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, Math.max(60, PREDICTION_INTERVAL_SEC) * 1000);
  console.log(`[PredictionMarkets] scheduler started interval=${Math.max(60, PREDICTION_INTERVAL_SEC)}s`);
}

export async function getPredictionRiskTrends(hours = 168) {
  await ensurePredictionTables();
  const safeHours = Math.max(1, Math.min(24 * 30, Number.isFinite(hours) ? hours : 168));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  const keys: Array<"inflation_risk" | "rates_risk" | "geopolitics_risk" | "grain_risk"> = [
    "inflation_risk",
    "rates_risk",
    "geopolitics_risk",
    "grain_risk",
  ];

  const result: Record<string, {
    latest: number | null;
    delta24h: number | null;
    delta7d: number | null;
    points: Array<{ ts: string; value: number }>;
  }> = {};

  for (const key of keys) {
    const rows = await db
      .select({ ts: macroRiskTimeseries.ts, value: macroRiskTimeseries.value })
      .from(macroRiskTimeseries)
      .where(and(eq(macroRiskTimeseries.indexName, key), gte(macroRiskTimeseries.ts, since)))
      .orderBy(macroRiskTimeseries.ts);

    const points = rows
      .map((row) => ({
        ts: row.ts ? new Date(row.ts).toISOString() : new Date().toISOString(),
        value: Number.parseFloat(String(row.value || "0")),
      }))
      .filter((point) => Number.isFinite(point.value));

    const latest = points.length > 0 ? points[points.length - 1].value : null;
    const findNearest = (targetMs: number) => {
      let candidate: { ts: string; value: number } | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const point of points) {
        const delta = Math.abs(Date.parse(point.ts) - targetMs);
        if (delta < best) {
          best = delta;
          candidate = point;
        }
      }
      return candidate;
    };

    const nowMs = Date.now();
    const ref24h = findNearest(nowMs - 24 * 60 * 60 * 1000);
    const ref7d = findNearest(nowMs - 7 * 24 * 60 * 60 * 1000);

    result[key] = {
      latest,
      delta24h: latest != null && ref24h ? Number((latest - ref24h.value).toFixed(4)) : null,
      delta7d: latest != null && ref7d ? Number((latest - ref7d.value).toFixed(4)) : null,
      points,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    hours: safeHours,
    keys,
    byIndex: result,
  };
}

export async function getPredictionMarketsDbSnapshot(limit = 100) {
  await ensurePredictionTables();
  const safeLimit = Math.max(1, Math.min(500, limit));
  const rows = await db
    .select()
    .from(macroPredictionMarkets)
    .orderBy(desc(macroPredictionMarkets.updatedAt))
    .limit(safeLimit);
  return rows;
}
