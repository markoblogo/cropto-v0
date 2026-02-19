import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { indexPrices, marketPriceFetchLog, marketPrices, marketPriceSourceStatus } from "@shared/schema";
import type { MarketPricePoint, SourceFetchAttempt, SourceStatusRow } from "../types";

function freshnessFromAsOf(asOf: string | null): "fresh" | "stale" {
  if (!asOf) return "stale";
  const ts = new Date(`${asOf}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(ts)) return "stale";
  const diff = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  return diff <= 1 ? "fresh" : "stale";
}

export async function upsertMarketPrice(point: MarketPricePoint): Promise<void> {
  const asOfDate = new Date(`${point.asOf}T00:00:00.000Z`);
  const basis = point.basis || "spot";

  const existing = await db
    .select({ id: marketPrices.id })
    .from(marketPrices)
    .where(
      and(
        eq(marketPrices.market, point.market),
        eq(marketPrices.commodity, point.commodity),
        eq(marketPrices.basis, basis),
        eq(marketPrices.asOf, asOfDate)
      )
    )
    .limit(1);

  const values = {
    market: point.market,
    commodity: point.commodity,
    category: point.category,
    variant: point.variant || null,
    rawCommodity: point.rawCommodity || null,
    basis,
    unit: "USD/t",
    price: point.price.toFixed(8),
    priceUsdPerTon: point.priceUsdPerTon ? point.priceUsdPerTon.toFixed(8) : null,
    priceRaw: point.priceRaw.toFixed(8),
    rawUnit: point.rawUnit,
    rawCurrency: point.rawCurrency,
    rawToUsdFxRate: point.rawToUsdFxRate != null ? point.rawToUsdFxRate.toFixed(10) : null,
    conversionNotes: point.conversionNotes || null,
    asOf: asOfDate,
    fetchedAt: new Date(point.fetchedAt),
    provider: point.source.vendor,
    channel: point.source.channel,
    sourceUrl: point.source.url,
    sourceLayer: point.source.layer,
    confidence: point.source.confidence != null ? point.source.confidence.toFixed(4) : null,
    freshnessStatus: freshnessFromAsOf(point.asOf),
    needsReview: (point.needsReview ? "true" : "false") as "true" | "false",
    rawMeta: JSON.stringify(point.raw || {}),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(marketPrices).set(values).where(eq(marketPrices.id, existing[0].id));
  } else {
    await db.insert(marketPrices).values(values);
  }

  const meta = {
    sourceType: "public_html",
    usagePolicy: "open",
    visibility: "public",
    sourceLayer: point.source.layer,
    confidence: point.source.confidence,
    provider: point.source.vendor,
    channel: point.source.channel,
    asOf: point.asOf,
    fetchedAt: point.fetchedAt,
    normalizedCommodity: point.commodity,
    category: point.category,
    rawCommodity: point.rawCommodity,
    priceRaw: point.priceRaw,
    rawUnit: point.rawUnit,
    rawCurrency: point.rawCurrency,
    rawToUsdFxRate: point.rawToUsdFxRate,
    conversionNotes: point.conversionNotes,
  };

  const legacyExisting = await db
    .select({ id: indexPrices.id })
    .from(indexPrices)
    .where(
      and(
        eq(indexPrices.country, point.market),
        eq(indexPrices.commodity, point.commodity.toUpperCase()),
        eq(indexPrices.label, basis),
        eq(indexPrices.asOfDate, asOfDate)
      )
    )
    .limit(1);

  const legacyValues = {
    commodity: point.commodity.toUpperCase(),
    price: point.price.toFixed(8),
    date: asOfDate,
    source: point.source.vendor,
    country: point.market,
    label: basis,
    asOfDate: asOfDate,
    raw: `${point.source.vendor}(${point.source.channel}): ${point.market}:${point.commodity}`,
    meta: JSON.stringify(meta),
    isDemo: "false" as const,
  };

  if (legacyExisting.length > 0) {
    await db.update(indexPrices).set(legacyValues).where(eq(indexPrices.id, legacyExisting[0].id));
  } else {
    await db.insert(indexPrices).values(legacyValues);
  }
}

export async function insertFetchAttempt(attempt: SourceFetchAttempt): Promise<void> {
  await db.insert(marketPriceFetchLog).values({
    provider: attempt.vendor,
    channel: attempt.channel,
    market: attempt.market,
    commodity: attempt.commodity,
    sourceUrl: attempt.url,
    sourceLayer: attempt.layer,
    status: attempt.status,
    statusCode: attempt.statusCode ?? null,
    latencyMs: attempt.latencyMs ?? null,
    pointCount: attempt.pointCount,
    confidence: attempt.confidence != null ? attempt.confidence.toFixed(4) : null,
    asOf: attempt.asOf ? new Date(`${attempt.asOf}T00:00:00.000Z`) : null,
    error: attempt.error || null,
    createdAt: new Date(attempt.fetchedAt),
  });
}

export async function upsertSourceStatus(row: SourceStatusRow): Promise<void> {
  const existing = await db
    .select({ id: marketPriceSourceStatus.id })
    .from(marketPriceSourceStatus)
    .where(
      and(
        eq(marketPriceSourceStatus.provider, row.vendor),
        eq(marketPriceSourceStatus.channel, row.channel),
        eq(marketPriceSourceStatus.market, row.market),
        eq(marketPriceSourceStatus.commodity, row.commodity),
        eq(marketPriceSourceStatus.sourceLayer, row.layer)
      )
    )
    .limit(1);

  const values = {
    provider: row.vendor,
    channel: row.channel,
    market: row.market,
    commodity: row.commodity,
    sourceLayer: row.layer,
    sourceUrl: row.sourceUrl,
    freshnessStatus: row.freshnessStatus,
    lastFetchedAt: row.lastFetchedAt ? new Date(row.lastFetchedAt) : null,
    lastSuccessAt: row.lastSuccessAt ? new Date(row.lastSuccessAt) : null,
    lastAsOf: row.lastAsOf ? new Date(`${row.lastAsOf}T00:00:00.000Z`) : null,
    lastLatencyMs: row.lastLatencyMs ?? null,
    confidence: row.confidence != null ? row.confidence.toFixed(4) : null,
    lastError: row.lastError || null,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(marketPriceSourceStatus).set(values).where(eq(marketPriceSourceStatus.id, existing[0].id));
  } else {
    await db.insert(marketPriceSourceStatus).values(values);
  }
}

export async function latestSourceStatusByMarket(market: string) {
  return db
    .select()
    .from(marketPriceSourceStatus)
    .where(eq(marketPriceSourceStatus.market, market))
    .orderBy(desc(marketPriceSourceStatus.updatedAt));
}

export async function getPreviousMarketPrice(args: { market: string; commodity: string; basis: string; beforeAsOf: string }) {
  const beforeDate = new Date(`${args.beforeAsOf}T00:00:00.000Z`);
  const rows = await db.execute(sql`
    select price, as_of
    from market_prices
    where market = ${args.market}
      and commodity = ${args.commodity}
      and basis = ${args.basis}
      and as_of < ${beforeDate}
    order by as_of desc
    limit 1
  `);
  return Array.isArray((rows as any).rows) && (rows as any).rows.length > 0 ? (rows as any).rows[0] : null;
}

export async function ensureIngestionTables(): Promise<void> {
  await db.execute(sql`
    create table if not exists market_prices (
      id uuid primary key default gen_random_uuid(),
      market text not null,
      commodity text not null,
      category text not null default 'other',
      variant text,
      raw_commodity text,
      basis text,
      unit text not null,
      price numeric(18,8) not null,
      price_usd_per_ton numeric(18,8),
      price_raw numeric(18,8),
      raw_unit text,
      raw_currency text,
      raw_to_usd_fx_rate numeric(20,10),
      conversion_notes text,
      as_of timestamp not null,
      fetched_at timestamp not null default now(),
      provider text not null,
      channel text not null default 'HTML_PAGE',
      source_url text not null,
      source_layer text not null default 'primary',
      confidence numeric(5,4),
      freshness_status text not null default 'fresh',
      needs_review text not null default 'false',
      raw_meta text,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    )
  `);

  await db.execute(sql`
    create table if not exists market_price_fetch_log (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      channel text not null default 'HTML_PAGE',
      market text not null,
      commodity text not null,
      source_url text not null,
      source_layer text not null default 'primary',
      status text not null,
      status_code integer,
      latency_ms integer,
      point_count integer not null default 0,
      confidence numeric(5,4),
      as_of timestamp,
      error text,
      created_at timestamp not null default now()
    )
  `);

  await db.execute(sql`
    create table if not exists market_price_source_status (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      channel text not null default 'HTML_PAGE',
      market text not null,
      commodity text not null,
      source_layer text not null default 'primary',
      source_url text not null,
      freshness_status text not null default 'failed',
      last_fetched_at timestamp,
      last_success_at timestamp,
      last_as_of timestamp,
      last_latency_ms integer,
      confidence numeric(5,4),
      last_error text,
      updated_at timestamp not null default now()
    )
  `);

  await db.execute(sql`create unique index if not exists market_prices_uni_idx on market_prices(market, commodity, basis, as_of)`);
  await db.execute(sql`create unique index if not exists market_price_source_status_uni_idx on market_price_source_status(provider, channel, market, commodity, source_layer)`);
}
