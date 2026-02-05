import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../server/db";
import { indexPrices, indexes, commodityIndexPrices } from "../shared/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

type BasisCheck = {
  country: string;
  commodity: string;
  label: string;
  source: string;
  price: number;
  asOf: string | null;
  status: "ok" | "warn" | "fail";
  reason: string;
};

const EXPORT_HINTS: Record<string, string[]> = {
  US: ["Gulf", "PNW", "Export", "St Louis", "Interior", "HRW", "2Y", "3YC"],
  BR: ["Paranagua", "FOB", "Export"],
  AR: ["Up River", "FOB", "Export", "Grade 2", "Feed"],
};

const PRICE_MIN = 80;
const PRICE_MAX = 1500;

function includesAny(label: string, hints: string[]): boolean {
  const l = (label || "").toLowerCase();
  return hints.some((h) => l.includes(h.toLowerCase()));
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function main() {
  const days = Number.parseInt(process.env.AUDIT_LOOKBACK_DAYS || "60", 10);
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  console.log(`\\n[Index Contract Audit] lookback=${days}d from=${fromDate.toISOString()}`);

  const latestExternal = await db
    .select({
      id: indexPrices.id,
      country: indexPrices.country,
      commodity: indexPrices.commodity,
      label: indexPrices.label,
      source: indexPrices.source,
      price: indexPrices.price,
      asOfDate: indexPrices.asOfDate,
      createdAt: indexPrices.createdAt,
    })
    .from(indexPrices)
    .where(
      and(
        gte(indexPrices.createdAt, fromDate),
        sql`${indexPrices.country} IN ('US','BR','AR')`,
        sql`${indexPrices.source} IN ('IGC','USDA_AMS','manual','spike_telegram','mock','synthetic_model')`
      )
    )
    .orderBy(desc(indexPrices.asOfDate), desc(indexPrices.createdAt));

  const keyMap = new Map<string, typeof latestExternal[number]>();
  for (const r of latestExternal) {
    const key = `${r.country}|${(r.commodity || "").toLowerCase()}|${r.label || ""}`;
    if (!keyMap.has(key)) keyMap.set(key, r);
  }

  const checks: BasisCheck[] = [];
  for (const r of keyMap.values()) {
    const country = r.country || "";
    const commodity = (r.commodity || "").toLowerCase();
    const label = r.label || "";
    const source = r.source || "";
    const price = toNum(r.price);
    const asOfCandidate = r.asOfDate ? new Date(r.asOfDate as any) : null;
    const asOf = asOfCandidate && !Number.isNaN(asOfCandidate.getTime()) ? asOfCandidate.toISOString() : null;

    if (!country || !commodity || !label) {
      checks.push({ country, commodity, label, source, price, asOf, status: "fail", reason: "missing country/commodity/label" });
      continue;
    }

    if (!Number.isFinite(price) || price <= 0) {
      checks.push({ country, commodity, label, source, price, asOf, status: "fail", reason: "non-positive or invalid price" });
      continue;
    }

    if (price < PRICE_MIN || price > PRICE_MAX) {
      checks.push({ country, commodity, label, source, price, asOf, status: "warn", reason: "price out of expected USD/ton range" });
      continue;
    }

    const hints = EXPORT_HINTS[country] || [];
    if (!includesAny(label, hints)) {
      checks.push({ country, commodity, label, source, price, asOf, status: "warn", reason: "label does not look like export basis" });
      continue;
    }

    checks.push({ country, commodity, label, source, price, asOf, status: "ok", reason: "export basis + plausible USD/ton" });
  }

  const uaIndexes = await db
    .select({
      id: indexes.id,
      slug: indexes.slug,
      name: indexes.name,
      category: indexes.category,
    })
    .from(indexes)
    .where(sql`${indexes.category} LIKE 'CPT%'`)
    .orderBy(indexes.category, indexes.name);

  const uaLatest = await Promise.all(
    uaIndexes.map(async (idx) => {
      const [p] = await db
        .select({
          timestamp: commodityIndexPrices.timestamp,
          price: commodityIndexPrices.price,
        })
        .from(commodityIndexPrices)
        .where(eq(commodityIndexPrices.indexId, idx.id))
        .orderBy(desc(commodityIndexPrices.timestamp))
        .limit(1);
      return {
        ...idx,
        lastTs: p?.timestamp ? new Date(p.timestamp).toISOString() : null,
        lastPrice: p ? toNum(p.price) : NaN,
      };
    })
  );

  const uaProcessing = uaLatest.filter((r) => (r.category || "").toLowerCase().includes("paritet") || (r.name || "").toLowerCase().includes("processing"));
  const uaExport = uaLatest.filter((r) => (r.category || "").toLowerCase().includes("odesa") && !(r.category || "").toLowerCase().includes("paritet"));

  const ok = checks.filter((c) => c.status === "ok").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;

  console.log("\\n[External BR/AR/US] summary");
  console.log({ totalSeries: checks.length, ok, warn, fail });

  if (warn + fail > 0) {
    console.log("\\n[External BR/AR/US] issues:");
    for (const c of checks.filter((x) => x.status !== "ok")) {
      console.log(`- [${c.status.toUpperCase()}] ${c.country} ${c.commodity} | ${c.label} | ${c.source} | ${c.price} | ${c.reason}`);
    }
  }

  console.log("\\n[UA CPT indexes] summary");
  console.log({
    total: uaLatest.length,
    exportCount: uaExport.length,
    processingCount: uaProcessing.length,
  });

  if (uaProcessing.length > 0) {
    console.log("\\n[UA CPT indexes] processing-like rows present (potential mismatch if you want export-only):");
    for (const r of uaProcessing) {
      console.log(`- ${r.slug} | ${r.name} | category=${r.category} | lastPrice=${r.lastPrice} | lastTs=${r.lastTs}`);
    }
  }

  const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).getTime();
  const staleUa = uaExport.filter((r) => !r.lastTs || new Date(r.lastTs).getTime() < staleCutoff);
  if (staleUa.length > 0) {
    console.log("\\n[UA export indexes] stale or missing recent quotes (>3d):");
    for (const r of staleUa) {
      console.log(`- ${r.slug} | ${r.name} | lastTs=${r.lastTs} | lastPrice=${r.lastPrice}`);
    }
  }

  console.log("\\n[Index Contract Audit] done.");
}

main().catch((error) => {
  console.error("[Index Contract Audit] fatal:", error);
  process.exit(1);
});
