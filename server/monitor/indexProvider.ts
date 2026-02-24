import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { commodityIndexPrices, indexes } from "@shared/schema";
import type { MonitorIndexPoint } from "./types";

export interface IndexProvider {
  listIndexes(): Promise<MonitorIndexPoint[]>;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number.parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

export class CroptoUkraineIndexProvider implements IndexProvider {
  async listIndexes(): Promise<MonitorIndexPoint[]> {
    const indexRows = await db.select().from(indexes).orderBy(indexes.name);
    const results: MonitorIndexPoint[] = [];

    for (const row of indexRows) {
      const latest = await db
        .select()
        .from(commodityIndexPrices)
        .where(eq(commodityIndexPrices.indexId, row.id))
        .orderBy(desc(commodityIndexPrices.timestamp))
        .limit(2);

      if (latest.length === 0) continue;

      const current = toNumber(latest[0]?.price);
      if (current == null) continue;
      const previous = toNumber(latest[1]?.price);
      const change = previous != null ? Number((current - previous).toFixed(2)) : undefined;

      results.push({
        slug: row.slug,
        name: row.name,
        value: Number(current.toFixed(2)),
        change,
        updatedAt: new Date(latest[0]!.timestamp).toISOString(),
        source: "Cropto internal index feed",
      });
    }

    return results;
  }
}
