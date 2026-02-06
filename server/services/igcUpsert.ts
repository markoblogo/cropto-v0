/**
 * IGC Price Upsert Service
 * Handles upserting IGC prices into indexPrices table
 */

import { db } from "../db";
import { analyticsEvents, indexPrices } from "@shared/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import type { IgcPrice } from "./igcPriceService";
import { getSourceDescriptor } from "./sourceCatalog";

/**
 * Upsert external prices into indexPrices table
 * Uses (commodity, country, label, as_of_date) as the unique key
 */
export async function upsertIgcIndexPrices(
  prices: IgcPrice[],
  source: "IGC" | "USDA_AMS" | "BARCHART_USDA" | "FUTURES_PROXY" = "IGC"
): Promise<number> {
  const descriptor = getSourceDescriptor(source);
  const anomalyThresholdPct = Number.parseFloat(process.env.DATA_ANOMALY_THRESHOLD_PCT || "15");
  let upserted = 0;

  for (const price of prices) {
    try {
      const asOfDateIso = price.asOfDate;
      const asOfDate = new Date(`${asOfDateIso}T00:00:00.000Z`);
      const confidence = price.confidence || "high";

      const values = {
        commodity: price.commodity.toUpperCase(),
        price: price.priceUsdPerTon.toFixed(8),
        date: asOfDate,
        source,
        country: price.country,
        label: price.label,
        asOfDate,
        dailyChangePct: price.dailyChangePct !== null && price.dailyChangePct !== undefined 
          ? price.dailyChangePct.toFixed(4) 
          : null,
        annualChangePct: price.annualChangePct !== null && price.annualChangePct !== undefined 
          ? price.annualChangePct.toFixed(4) 
          : null,
        low52w: price.low52w !== null && price.low52w !== undefined 
          ? price.low52w.toFixed(8) 
          : null,
        high52w: price.high52w !== null && price.high52w !== undefined 
          ? price.high52w.toFixed(8) 
          : null,
        rawRow: JSON.stringify(price.rawRow), // Store as JSON string (JSONB in DB)
        raw: `${source}: ${price.commodity} ${price.label}`,
        meta: JSON.stringify({
          source,
          commodity: price.commodity,
          country: price.country,
          label: price.label,
          confidence,
          sourceType: descriptor.sourceType,
          usagePolicy: descriptor.usagePolicy,
          visibility: descriptor.visibility,
          priority: descriptor.priority,
          ...(price.meta || {}),
        }),
        isDemo: "false" as const,
      };

      const prev = await db
        .select({
          id: indexPrices.id,
          price: indexPrices.price,
          asOfDate: indexPrices.asOfDate,
        })
        .from(indexPrices)
        .where(
          and(
            eq(indexPrices.source, source),
            eq(indexPrices.country, price.country),
            eq(indexPrices.label, price.label),
            eq(indexPrices.commodity, price.commodity.toUpperCase()),
            lt(indexPrices.asOfDate, asOfDate)
          )
        )
        .orderBy(desc(indexPrices.asOfDate))
        .limit(1);

      const existing = await db
        .select({ id: indexPrices.id })
        .from(indexPrices)
        .where(
          and(
            eq(indexPrices.source, source),
            eq(indexPrices.country, price.country),
            eq(indexPrices.label, price.label),
            eq(indexPrices.commodity, price.commodity.toUpperCase()),
            eq(indexPrices.asOfDate, asOfDate)
          )
        )
        .limit(1);

      const existingCommoditySeries = await db
        .select({ id: indexPrices.id })
        .from(indexPrices)
        .where(
          and(
            eq(indexPrices.source, source),
            eq(indexPrices.country, price.country),
            eq(indexPrices.commodity, price.commodity.toUpperCase())
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(indexPrices)
          .set(values)
          .where(eq(indexPrices.id, existing[0].id));
      } else {
        await db.insert(indexPrices).values(values);
      }

      if (existingCommoditySeries.length === 0) {
        await db.insert(analyticsEvents).values({
          eventName: "data_catalog_new_commodity",
          payload: JSON.stringify({
            source,
            country: price.country,
            commodity: price.commodity,
            label: price.label,
            asOfDate: asOfDateIso,
          }),
        });
        console.log(
          `[IGC Upsert] discovered new commodity series source=${source} country=${price.country} commodity=${price.commodity}`
        );
      }

      if (prev.length > 0) {
        const prevPrice = Number.parseFloat(String(prev[0].price));
        const nextPrice = price.priceUsdPerTon;
        if (Number.isFinite(prevPrice) && prevPrice > 0) {
          const deltaPct = ((nextPrice - prevPrice) / prevPrice) * 100;
          if (Math.abs(deltaPct) >= anomalyThresholdPct) {
            await db.insert(analyticsEvents).values({
              eventName: "data_quality_anomaly",
              payload: JSON.stringify({
                source,
                country: price.country,
                commodity: price.commodity,
                label: price.label,
                asOfDate: asOfDateIso,
                prevAsOfDate: prev[0].asOfDate,
                prevPrice,
                nextPrice,
                deltaPct: Number(deltaPct.toFixed(4)),
                thresholdPct: anomalyThresholdPct,
              }),
            });
            console.warn(
              `[IGC Upsert] anomaly source=${source} ${price.country} ${price.commodity} ${price.label} delta=${deltaPct.toFixed(2)}%`
            );
          }
        }
      }

      upserted++;
      console.log(`[IGC Upsert] Upserted: source=${source}, ${price.country} ${price.commodity} ${price.label} (${asOfDateIso})`);
    } catch (error: any) {
      console.error(`[IGC Upsert] Error upserting source=${source} ${price.country} ${price.commodity} ${price.label}:`, error.message);
      // Continue with next price
    }
  }

  return upserted;
}
