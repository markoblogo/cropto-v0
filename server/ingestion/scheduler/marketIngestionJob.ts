import { MARKET_COMMODITY_CONFIG, providerDefinitionsFor } from "../config";
import type { IngestionMarket, MarketPricePoint, ProviderDefinition, SourceLayer } from "../types";
import { fetchAndParseProvider } from "../sources/common";
import { ensureIngestionTables, getPreviousMarketPrice, insertFetchAttempt, upsertMarketPrice, upsertSourceStatus } from "../storage/repository";
import { applyUsdNormalization } from "../normalization/price";
import { validateUsdPerTon } from "../normalization/priceSanity";
import { getFxSnapshotOrFetch } from "./fxIngestionJob";
import { db } from "../../db";
import { sql } from "drizzle-orm";

const INTERVAL_HOURS = Number.parseInt(process.env.MARKET_INGESTION_INTERVAL_HOURS || "24", 10);
const ENABLED = process.env.ENABLE_MARKET_INGESTION !== "false";
const DISABLE_PRIMARY = process.env.INGESTION_DISABLE_PRIMARY === "1";
let timer: NodeJS.Timeout | null = null;

type RuntimeState = {
  enabled: boolean;
  intervalHours: number;
  schedulerRunning: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastUpserted: number;
  lastFailedPrimaries: number;
  disablePrimary: boolean;
  disabledVendors: string[];
};

const runtimeState: RuntimeState = {
  enabled: ENABLED,
  intervalHours: INTERVAL_HOURS,
  schedulerRunning: false,
  startedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastUpserted: 0,
  lastFailedPrimaries: 0,
  disablePrimary: DISABLE_PRIMARY,
  disabledVendors: (process.env.INGESTION_DISABLE_VENDOR || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
};

async function persistRuntimeState(extra?: Record<string, unknown>): Promise<void> {
  try {
    await db.execute(sql`
      create table if not exists app_settings (
        key text primary key,
        value text not null,
        updated_at timestamp not null default now()
      )
    `);
    const payload = JSON.stringify({
      ...runtimeState,
      ...extra,
      updatedAt: new Date().toISOString(),
    });
    await db.execute(sql`
      insert into app_settings(key, value, updated_at)
      values ('market_ingestion_runtime', ${payload}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `);
  } catch (error) {
    console.warn("[MarketIngestion] failed to persist runtime state:", (error as Error)?.message || error);
  }
}

function isFresh(asOf: string | null): boolean {
  if (!asOf) return false;
  const ts = new Date(`${asOf}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(ts)) return false;
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  return days <= 1;
}

function isProviderDisabled(provider: string): boolean {
  const all = (process.env.INGESTION_DISABLE_VENDOR || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (all.includes(provider.toUpperCase())) return true;
  return process.env[`INGESTION_DISABLE_VENDOR_${provider.toUpperCase()}`] === "1";
}

function validatePoint(point: MarketPricePoint): { ok: boolean; reasons: string[]; needsReview: boolean } {
  const reasons: string[] = [];
  let needsReview = false;

  if (!(point.price > 0)) reasons.push("price_usd<=0");
  if (!point.asOf || Number.isNaN(new Date(`${point.asOf}T00:00:00.000Z`).getTime())) reasons.push("invalid_as_of");
  if (point.unit !== "USD/t") reasons.push("unit_not_usd_t");
  if (!point.priceUsdPerTon || !(point.priceUsdPerTon > 0)) {
    reasons.push("missing_price_usd_per_ton");
    needsReview = true;
  }
  const sanity = validateUsdPerTon(point);
  if (!sanity.valid) {
    reasons.push(`invalid:${sanity.invalidReason}`);
    needsReview = true;
    point.raw = {
      ...(point.raw || {}),
      invalidReason: sanity.invalidReason,
    };
  }

  return { ok: reasons.length === 0, reasons, needsReview };
}

async function annotateAnomaly(point: MarketPricePoint): Promise<void> {
  const threshold = Number.parseFloat(process.env.MARKET_INGESTION_DAILY_JUMP_PCT || "20");
  const prev = await getPreviousMarketPrice({
    market: point.market,
    commodity: point.commodity,
    basis: point.basis || "spot",
    beforeAsOf: point.asOf,
  });

  if (!prev) return;
  const prevPrice = Number.parseFloat(String(prev.price));
  if (!Number.isFinite(prevPrice) || prevPrice <= 0) return;

  const deltaPct = ((point.price - prevPrice) / prevPrice) * 100;
  if (Math.abs(deltaPct) >= threshold) {
    point.needsReview = true;
    point.raw = {
      ...(point.raw || {}),
      parser: `${point.raw?.parser || "heuristic"};deltaPct=${deltaPct.toFixed(2)}`,
    };
  }
}

function pickDefinitions(provider: string, market: IngestionMarket, commodity: string): ProviderDefinition[] {
  const defs = providerDefinitionsFor(provider, market);
  if (defs.length <= 1) return defs;

  const byCommodity = defs.filter((d) => d.commodityHint.toLowerCase().includes(commodity));
  return byCommodity;
}

async function tryProvider(
  provider: string,
  market: IngestionMarket,
  commodity: string,
  layer: SourceLayer,
  basis: string | undefined,
  historyDays: number
): Promise<{ points: MarketPricePoint[]; error?: string }> {
  if (layer === "primary" && DISABLE_PRIMARY) {
    return { points: [], error: "primary_disabled_by_env" };
  }
  if (isProviderDisabled(provider)) {
    return { points: [], error: "provider_disabled_by_env" };
  }

  const defs = pickDefinitions(provider, market, commodity);
  if (defs.length === 0) return { points: [], error: "provider_definition_missing" };

  const fx = await getFxSnapshotOrFetch();
  let lastError = "no_data";

  for (const def of defs) {
    try {
      const result = await fetchAndParseProvider(def, layer);
      const normalizedPoints = result.points
        .slice(0, historyDays)
        .filter((p) => p.commodity === commodity)
        .map((p) => ({ ...p, basis: basis || p.basis }))
        .map((p) => applyUsdNormalization(p, fx));

      const validPoints = normalizedPoints.filter((p) => p.priceUsdPerTon && p.priceUsdPerTon > 0);
      const latest = validPoints[0] || null;

      await insertFetchAttempt({
        vendor: def.vendor,
        channel: def.channel,
        market,
        commodity,
        url: def.url,
        layer,
        status: latest ? "ok" : "failed",
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        confidence: result.confidence,
        asOf: latest?.asOf || null,
        fetchedAt: new Date().toISOString(),
        pointCount: validPoints.length,
        error: latest ? undefined : `no_point:${result.notes.join(";")}`,
      });

      await upsertSourceStatus({
        vendor: def.vendor,
        channel: def.channel,
        market,
        commodity,
        layer,
        sourceUrl: def.url,
        freshnessStatus: latest ? (isFresh(latest.asOf) ? "fresh" : "stale") : "failed",
        lastFetchedAt: new Date().toISOString(),
        lastSuccessAt: latest ? new Date().toISOString() : null,
        lastAsOf: latest?.asOf || null,
        lastLatencyMs: result.latencyMs,
        confidence: result.confidence,
        lastError: latest ? null : `empty:${result.notes.join(";")}`,
      });

      if (validPoints.length > 0) {
        const acceptedPoints: MarketPricePoint[] = [];
        for (const point of validPoints) {
          const validation = validatePoint(point);
          point.needsReview = point.needsReview || validation.needsReview;
          if (!validation.ok) {
            point.raw = {
              ...(point.raw || {}),
              invalidReason: validation.reasons.join(","),
            };
            continue;
          }
          await annotateAnomaly(point);
          acceptedPoints.push(point);
        }
        if (acceptedPoints.length > 0) {
          return { points: acceptedPoints };
        }
        lastError = "all_points_invalid_after_validation";
      }

      lastError = `no_point:${result.notes.join(";")}`;
    } catch (error: any) {
      lastError = error?.message || String(error);
      await insertFetchAttempt({
        vendor: provider,
        channel: "unknown",
        market,
        commodity,
        url: def.url,
        layer,
        status: "failed",
        pointCount: 0,
        fetchedAt: new Date().toISOString(),
        error: lastError,
      });
      await upsertSourceStatus({
        vendor: provider,
        channel: def.channel,
        market,
        commodity,
        layer,
        sourceUrl: def.url,
        freshnessStatus: "failed",
        lastFetchedAt: new Date().toISOString(),
        lastSuccessAt: null,
        lastAsOf: null,
        lastLatencyMs: null,
        confidence: null,
        lastError,
      });
    }
  }

  return { points: [], error: lastError };
}

export async function runMarketIngestionOnce(options?: { markets?: IngestionMarket[]; historyDays?: number }): Promise<{ upserted: number; failedPrimaries: number }> {
  runtimeState.lastRunAt = new Date().toISOString();
  await persistRuntimeState({ event: "tick_start" });
  await ensureIngestionTables();
  let upserted = 0;
  let failedPrimaries = 0;
  const historyDays = Math.min(Math.max(options?.historyDays || Number.parseInt(process.env.INGEST_HISTORY_DAYS || "60", 10), 1), 730);
  const marketFilter = options?.markets;

  for (const cfg of MARKET_COMMODITY_CONFIG) {
    if (marketFilter && !marketFilter.includes(cfg.market)) continue;

    const primary = await tryProvider(cfg.primaryProvider, cfg.market, cfg.commodity, "primary", cfg.basis, historyDays);
    let selectedPoints = primary.points;

    if (selectedPoints.length === 0) {
      failedPrimaries += 1;
      for (const fallbackProvider of cfg.fallbackProviders) {
        const fallback = await tryProvider(fallbackProvider, cfg.market, cfg.commodity, "fallback", cfg.basis, historyDays);
        if (fallback.points.length > 0) {
          selectedPoints = fallback.points;
          break;
        }
      }
    }

    if (selectedPoints.length === 0) continue;

    for (const point of selectedPoints) {
      point.status = isFresh(point.asOf) ? "fresh" : "stale";
      await upsertMarketPrice(point);
      upserted += 1;
    }
  }

  runtimeState.lastUpserted = upserted;
  runtimeState.lastFailedPrimaries = failedPrimaries;
  runtimeState.lastSuccessAt = new Date().toISOString();
  runtimeState.lastErrorAt = null;
  runtimeState.lastErrorMessage = null;
  await persistRuntimeState({ event: "tick_success" });
  console.log(`[MarketIngestion] tick completed upserted=${upserted} failedPrimaries=${failedPrimaries}`);
  return { upserted, failedPrimaries };
}

export function startMarketIngestionScheduler(): void {
  if (!ENABLED) {
    runtimeState.lastErrorMessage = "ENABLE_MARKET_INGESTION=false";
    void persistRuntimeState({ schedulerRunning: false, event: "disabled" });
    console.log("[MarketIngestion] disabled via ENABLE_MARKET_INGESTION=false");
    return;
  }
  if (timer) return;

  const intervalMs = Math.max(1, INTERVAL_HOURS) * 60 * 60 * 1000;
  runtimeState.schedulerRunning = true;
  runtimeState.startedAt = new Date().toISOString();
  void persistRuntimeState({ event: "scheduler_started" });
  console.log(`[MarketIngestion] scheduler started interval=${INTERVAL_HOURS}h`);

  runMarketIngestionOnce().catch((error) => {
    runtimeState.lastErrorAt = new Date().toISOString();
    runtimeState.lastErrorMessage = error?.message || String(error);
    void persistRuntimeState({ event: "tick_error" });
    console.error("[MarketIngestion] initial run failed:", error?.message || error);
  });

  timer = setInterval(() => {
    runMarketIngestionOnce().catch((error) => {
      runtimeState.lastErrorAt = new Date().toISOString();
      runtimeState.lastErrorMessage = error?.message || String(error);
      void persistRuntimeState({ event: "tick_error" });
      console.error("[MarketIngestion] scheduled run failed:", error?.message || error);
    });
  }, intervalMs);
}

export function stopMarketIngestionScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  runtimeState.schedulerRunning = false;
  void persistRuntimeState({ event: "scheduler_stopped" });
}

export function getMarketIngestionRuntimeState(): RuntimeState {
  return {
    ...runtimeState,
    enabled: ENABLED,
    intervalHours: INTERVAL_HOURS,
    disablePrimary: DISABLE_PRIMARY,
    disabledVendors: (process.env.INGESTION_DISABLE_VENDOR || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  };
}
