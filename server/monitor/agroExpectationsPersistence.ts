import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { agroCompositeTimeseries, cgoWeights } from "@shared/schema";
import { getAgroExpectationsSnapshot } from "./agroExpectationsService";

const AGRO_EXPECT_INTERVAL_SEC = Number.parseInt(process.env.MONITOR_AGRO_EXPECT_INTERVAL_SEC || "1800", 10);
const RUN_AGRO_EXPECT_JOBS_IN_WEB = process.env.RUN_AGRO_EXPECT_JOBS_IN_WEB !== "false";

type CommodityKey = "corn" | "wheat" | "rice" | "barley" | "soy" | "oilseeds";

const DEFAULT_WORLD_WEIGHTS: Record<CommodityKey, number> = {
  corn: 0.30,
  wheat: 0.25,
  rice: 0.20,
  barley: 0.05,
  soy: 0.10,
  oilseeds: 0.10,
};

let timer: NodeJS.Timeout | null = null;
let inFlight = false;
let tablesEnsured = false;

function toDecimalString(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(6)));
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function parseNumber(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

async function ensureTables() {
  if (tablesEnsured) return;
  await db.execute(sql`
    create table if not exists cgo_weights (
      id uuid primary key default gen_random_uuid(),
      year integer not null,
      region text not null default 'GLOBAL',
      commodity text not null,
      weight numeric(12,8) not null,
      source text not null default 'seed',
      meta text,
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create unique index if not exists cgo_weights_unique_idx on cgo_weights (year, region, commodity);`);
  await db.execute(sql`create index if not exists cgo_weights_region_idx on cgo_weights (region, year desc);`);
  await db.execute(sql`
    create table if not exists agro_composite_timeseries (
      id uuid primary key default gen_random_uuid(),
      ts timestamptz not null default now(),
      source text not null default 'agro_expectations',
      index_name text not null,
      region text not null default 'GLOBAL',
      value numeric(14,6) not null,
      details text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists agro_composite_timeseries_idx on agro_composite_timeseries (index_name, region, ts desc);`);
  tablesEnsured = true;
}

async function ensureDefaultWeights(year: number, region = "GLOBAL") {
  await ensureTables();
  const rows = await db
    .select({ commodity: cgoWeights.commodity })
    .from(cgoWeights)
    .where(and(eq(cgoWeights.year, year), eq(cgoWeights.region, region)));

  const existing = new Set(rows.map((row) => row.commodity));
  const inserts = (Object.entries(DEFAULT_WORLD_WEIGHTS) as Array<[CommodityKey, number]>)
    .filter(([commodity]) => !existing.has(commodity))
    .map(([commodity, weight]) => ({
      year,
      region,
      commodity,
      weight: toDecimalString(weight),
      source: "seed_default_world",
      meta: safeJson({ note: "Default CGO_ext world weights seeded automatically" }),
      updatedAt: new Date(),
    }));
  if (inserts.length > 0) {
    await db.insert(cgoWeights).values(inserts);
  }
}

function nearestFromSeries(series: number[] | undefined, fallback: number | null): number | null {
  if (Array.isArray(series) && series.length > 0) {
    const val = series[series.length - 1];
    return Number.isFinite(val) ? Number(val) : fallback;
  }
  return fallback;
}

function normalizeSeries(series: number[] | undefined): number[] {
  if (!Array.isArray(series) || series.length < 2) return [];
  const base = series[0] || 1;
  if (!Number.isFinite(base) || base === 0) return [];
  return series.map((value) => Number((value / base).toFixed(6)));
}

async function computeCgoExtFromSnapshot(year: number, region: string, etfRows: Array<{ symbol: string; price: number | null; series?: number[] }>) {
  const weightRows = await db
    .select({ commodity: cgoWeights.commodity, weight: cgoWeights.weight })
    .from(cgoWeights)
    .where(and(eq(cgoWeights.year, year), eq(cgoWeights.region, region)));

  const weightByCommodity: Partial<Record<CommodityKey, number>> = {};
  for (const row of weightRows) {
    const key = String(row.commodity).toLowerCase() as CommodityKey;
    const parsed = parseNumber(row.weight);
    if (parsed != null) weightByCommodity[key] = parsed;
  }

  const bySymbol = Object.fromEntries(etfRows.map((row) => [row.symbol.toUpperCase(), row]));
  const cornSeries = normalizeSeries(bySymbol.CORN?.series);
  const wheatSeries = normalizeSeries(bySymbol.WEAT?.series);
  const soySeries = normalizeSeries(bySymbol.SOYB?.series);
  const dbaSeries = normalizeSeries(bySymbol.DBA?.series);
  const tagsSeries = normalizeSeries(bySymbol.TAGS?.series);

  const components: Record<CommodityKey, number[]> = {
    corn: cornSeries,
    wheat: wheatSeries,
    rice: dbaSeries,
    barley: dbaSeries,
    soy: soySeries,
    oilseeds: tagsSeries.length > 0 ? tagsSeries : soySeries,
  };

  const minLen = Object.values(components)
    .filter((series) => series.length >= 2)
    .reduce((acc, series) => (acc === 0 ? series.length : Math.min(acc, series.length)), 0);

  if (minLen < 2) {
    return {
      value: null as number | null,
      dayChangePct: null as number | null,
      d30ChangePct: null as number | null,
      series: [] as number[],
      componentCoverage: 0,
      weights: weightByCommodity,
    };
  }

  const weights: Record<CommodityKey, number> = {
    corn: weightByCommodity.corn ?? DEFAULT_WORLD_WEIGHTS.corn,
    wheat: weightByCommodity.wheat ?? DEFAULT_WORLD_WEIGHTS.wheat,
    rice: weightByCommodity.rice ?? DEFAULT_WORLD_WEIGHTS.rice,
    barley: weightByCommodity.barley ?? DEFAULT_WORLD_WEIGHTS.barley,
    soy: weightByCommodity.soy ?? DEFAULT_WORLD_WEIGHTS.soy,
    oilseeds: weightByCommodity.oilseeds ?? DEFAULT_WORLD_WEIGHTS.oilseeds,
  };

  const aligned: Record<CommodityKey, number[]> = {
    corn: components.corn.slice(-minLen),
    wheat: components.wheat.slice(-minLen),
    rice: components.rice.slice(-minLen),
    barley: components.barley.slice(-minLen),
    soy: components.soy.slice(-minLen),
    oilseeds: components.oilseeds.slice(-minLen),
  };

  const series = Array.from({ length: minLen }, (_, idx) => {
    const score =
      weights.corn * aligned.corn[idx] +
      weights.wheat * aligned.wheat[idx] +
      weights.rice * aligned.rice[idx] +
      weights.barley * aligned.barley[idx] +
      weights.soy * aligned.soy[idx] +
      weights.oilseeds * aligned.oilseeds[idx];
    return Number((100 * score).toFixed(6));
  });

  const latest = nearestFromSeries(series, null);
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const d30Ref = series.length >= 10 ? series[series.length - 10] : series[0];
  const pct = (cur: number | null, past: number | null) => {
    if (cur == null || past == null || past === 0) return null;
    return Number((((cur - past) / past) * 100).toFixed(2));
  };

  return {
    value: latest,
    dayChangePct: pct(latest, prev),
    d30ChangePct: pct(latest, d30Ref),
    series,
    componentCoverage: Object.values(components).filter((values) => values.length >= 2).length,
    weights,
  };
}

export async function runAgroExpectationsIngestionOnce(forceRefresh = true) {
  await ensureTables();
  const now = new Date();
  const year = now.getUTCFullYear();
  const region = "GLOBAL";
  await ensureDefaultWeights(year, region);

  const snapshot = await getAgroExpectationsSnapshot(forceRefresh);
  const etfRows = snapshot.etfProxies?.rows || [];
  const cgoBasic = snapshot.etfProxies?.cgoComposite;
  const cgoExt = await computeCgoExtFromSnapshot(year, region, etfRows);

  const inserts: Array<{
    ts: Date;
    source: string;
    indexName: string;
    region: string;
    value: string;
    details: string;
  }> = [];

  if (cgoBasic?.value != null && Number.isFinite(cgoBasic.value)) {
    inserts.push({
      ts: now,
      source: "agro_expectations",
      indexName: "cgo_basic",
      region,
      value: toDecimalString(cgoBasic.value),
      details: safeJson({
        note: cgoBasic.note,
        dayChangePct: cgoBasic.dayChangePct,
        d30ChangePct: cgoBasic.d30ChangePct,
      }),
    });
  }

  if (cgoExt.value != null && Number.isFinite(cgoExt.value)) {
    inserts.push({
      ts: now,
      source: "agro_expectations",
      indexName: "cgo_ext",
      region,
      value: toDecimalString(cgoExt.value),
      details: safeJson({
        year,
        componentCoverage: cgoExt.componentCoverage,
        dayChangePct: cgoExt.dayChangePct,
        d30ChangePct: cgoExt.d30ChangePct,
        weights: cgoExt.weights,
      }),
    });
  }

  if (inserts.length > 0) {
    await db.insert(agroCompositeTimeseries).values(inserts);
  }

  return {
    generatedAt: snapshot.generatedAt,
    cgoBasicValue: cgoBasic?.value ?? null,
    cgoExtValue: cgoExt.value,
    rowsInserted: inserts.length,
    weightYear: year,
    region,
  };
}

export function startAgroExpectationsScheduler() {
  if (!RUN_AGRO_EXPECT_JOBS_IN_WEB) {
    console.log("[AgroExpect] RUN_AGRO_EXPECT_JOBS_IN_WEB=false; skipping in web service.");
    return;
  }
  if (timer) return;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await runAgroExpectationsIngestionOnce(true);
      console.log(`[AgroExpect] tick complete cgo_basic=${result.cgoBasicValue ?? "n/a"} cgo_ext=${result.cgoExtValue ?? "n/a"} rows=${result.rowsInserted}`);
    } catch (error: any) {
      console.error("[AgroExpect] tick failed:", error?.message || error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), Math.max(300, AGRO_EXPECT_INTERVAL_SEC) * 1000);
  console.log(`[AgroExpect] scheduler started interval=${Math.max(300, AGRO_EXPECT_INTERVAL_SEC)}s`);
}

export async function getAgroCompositeTrends(hours = 168, region = "GLOBAL") {
  await ensureTables();
  const safeHours = Math.max(1, Math.min(24 * 30, Number.isFinite(hours) ? hours : 168));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  const keys: Array<"cgo_basic" | "cgo_ext"> = ["cgo_basic", "cgo_ext"];

  const byIndex: Record<string, {
    latest: number | null;
    delta24h: number | null;
    delta7d: number | null;
    points: Array<{ ts: string; value: number }>;
  }> = {};

  for (const key of keys) {
    const rows = await db
      .select({ ts: agroCompositeTimeseries.ts, value: agroCompositeTimeseries.value })
      .from(agroCompositeTimeseries)
      .where(and(eq(agroCompositeTimeseries.indexName, key), eq(agroCompositeTimeseries.region, region), gte(agroCompositeTimeseries.ts, since)))
      .orderBy(agroCompositeTimeseries.ts);

    const points = rows
      .map((row) => ({
        ts: row.ts ? new Date(row.ts).toISOString() : new Date().toISOString(),
        value: Number.parseFloat(String(row.value || "0")),
      }))
      .filter((point) => Number.isFinite(point.value));

    const latest = points.length > 0 ? points[points.length - 1].value : null;
    const nowMs = Date.now();
    const nearest = (targetMs: number) => {
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

    const ref24h = nearest(nowMs - 24 * 60 * 60 * 1000);
    const ref7d = nearest(nowMs - 7 * 24 * 60 * 60 * 1000);
    byIndex[key] = {
      latest,
      delta24h: latest != null && ref24h ? Number((latest - ref24h.value).toFixed(4)) : null,
      delta7d: latest != null && ref7d ? Number((latest - ref7d.value).toFixed(4)) : null,
      points,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    hours: safeHours,
    region,
    byIndex,
  };
}

export async function getCgoWeightsSnapshot(year = new Date().getUTCFullYear(), region = "GLOBAL") {
  await ensureTables();
  const rows = await db
    .select({
      year: cgoWeights.year,
      region: cgoWeights.region,
      commodity: cgoWeights.commodity,
      weight: cgoWeights.weight,
      source: cgoWeights.source,
      meta: cgoWeights.meta,
      updatedAt: cgoWeights.updatedAt,
    })
    .from(cgoWeights)
    .where(and(eq(cgoWeights.year, year), eq(cgoWeights.region, region)))
    .orderBy(desc(cgoWeights.weight));

  return {
    generatedAt: new Date().toISOString(),
    year,
    region,
    rows: rows.map((row) => ({
      ...row,
      weight: parseNumber(row.weight) ?? 0,
    })),
  };
}
