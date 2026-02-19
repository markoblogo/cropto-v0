#!/usr/bin/env tsx
import { db } from "../server/db";
import { marketPrices, marketPriceSourceStatus } from "../shared/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { runMarketIngestionOnce } from "../server/ingestion/scheduler/marketIngestionJob";

async function main() {
  process.env.ENABLE_MARKET_INGESTION = "true";
  process.env.INGEST_HISTORY_DAYS = process.env.INGEST_HISTORY_DAYS || "7";
  process.env.INGESTION_DISABLE_PRIMARY = process.env.INGESTION_DISABLE_PRIMARY || "0";

  const run = await runMarketIngestionOnce({ markets: ["US"], historyDays: 7 });

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(marketPrices)
    .where(and(eq(marketPrices.market, "US"), gte(marketPrices.fetchedAt, yesterday)))
    .orderBy(desc(marketPrices.fetchedAt))
    .limit(20);

  const statusRows = await db
    .select()
    .from(marketPriceSourceStatus)
    .where(eq(marketPriceSourceStatus.market, "US"))
    .orderBy(desc(marketPriceSourceStatus.updatedAt))
    .limit(20);

  const hasUsd = rows.some((r) => Number.parseFloat(String(r.priceUsdPerTon || r.price)) > 0);
  const hasFreshness = rows.some((r) => r.freshnessStatus === "fresh" || r.freshnessStatus === "stale");
  const hasStatus = statusRows.length > 0;

  const summary = {
    upserted: run.upserted,
    failedPrimaries: run.failedPrimaries,
    rows: rows.length,
    statusRows: statusRows.length,
    hasUsd,
    hasStatus,
    hasFreshness,
  };

  console.table(rows.slice(0, 5).map((r) => ({ market: r.market, commodity: r.commodity, asOf: r.asOf, priceUsdPerTon: r.priceUsdPerTon, provider: r.provider, channel: (r as any).channel, freshness: r.freshnessStatus })));
  console.table(statusRows.slice(0, 5).map((r) => ({ market: r.market, commodity: r.commodity, provider: r.provider, channel: (r as any).channel, freshness: r.freshnessStatus, lastError: r.lastError })));

  if (!hasUsd || !hasStatus || !hasFreshness) {
    console.error("ingest:smoke failed", summary);
    process.exit(1);
  }

  console.log("ingest:smoke passed", summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
