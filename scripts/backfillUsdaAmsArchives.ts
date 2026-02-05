/**
 * Backfill USDA AMS JO_GR850 archives into index_prices (source=USDA_AMS).
 *
 * Usage:
 *   npx tsx scripts/backfillUsdaAmsArchives.ts --days=180
 *   npx tsx scripts/backfillUsdaAmsArchives.ts --from=2025-08-01 --to=2026-02-05
 *   npx tsx scripts/backfillUsdaAmsArchives.ts --days=180 --dry-run
 */

import * as dotenv from "dotenv";
dotenv.config();

import { upsertIgcIndexPrices } from "../server/services/igcUpsert";
import { getUsdaSpec } from "../server/services/specRegistry";
import type { IgcPrice } from "../server/services/igcPriceService";

const USDA_AMS_FALLBACK_URL =
  process.env.USDA_AMS_EXPORT_BIDS_URL || "https://www.ams.usda.gov/mnreports/jo_gr850.txt";
const USDA_AMS_MARS_LIST_URL =
  process.env.USDA_AMS_MARS_LIST_URL ||
  "https://marsapi.ams.usda.gov/services/v1.1/public/listPublishedReports/all";

type Commodity = IgcPrice["commodity"];

const BUSHEL_KG: Record<Exclude<Commodity, "barley" | "rice">, number> = {
  maize: 25.40117272,
  wheat: 27.2155422,
  soybeans: 27.2155422,
};

type CliOptions = {
  from?: string;
  to?: string;
  days: number;
  maxReports: number;
  sleepMs: number;
  dryRun: boolean;
};

type ReportRef = {
  url: string;
  ts: number;
};

function parseCli(): CliOptions {
  const opts: CliOptions = {
    days: 180,
    maxReports: 400,
    sleepMs: 100,
    dryRun: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--from=")) opts.from = arg.split("=")[1];
    else if (arg.startsWith("--to=")) opts.to = arg.split("=")[1];
    else if (arg.startsWith("--days=")) opts.days = Number.parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--maxReports=")) opts.maxReports = Number.parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--sleepMs=")) opts.sleepMs = Number.parseInt(arg.split("=")[1], 10);
    else if (arg === "--dry-run") opts.dryRun = true;
  }

  return opts;
}

function toAbsoluteUsdaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `https://www.ams.usda.gov${url}`;
  return `https://www.ams.usda.gov/${url}`;
}

function parseMarsDate(value: unknown): number {
  const str = String(value || "");
  const t = new Date(str).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function collectMarsCandidates(node: unknown, out: ReportRef[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectMarsCandidates(item, out);
    return;
  }

  const record = node as Record<string, unknown>;
  const serialized = JSON.stringify(record).toUpperCase();
  const reportHint = serialized.includes("JO_GR850");

  if (reportHint) {
    for (const [k, v] of Object.entries(record)) {
      if (typeof v !== "string") continue;
      const keyUpper = k.toUpperCase();
      const valueUpper = v.toUpperCase();
      const looksLikeUrl = keyUpper.includes("URL") || keyUpper.includes("LINK") || keyUpper.includes("FILE");
      const looksLikeTxt = valueUpper.includes("JO_GR850") && valueUpper.includes(".TXT");
      if (looksLikeUrl && looksLikeTxt) {
        const ts =
          parseMarsDate(record.reportDate) ||
          parseMarsDate(record.publishedDate) ||
          parseMarsDate(record.releaseDate) ||
          Date.now();
        out.push({ url: toAbsoluteUsdaUrl(v), ts });
      }
    }
  }

  for (const child of Object.values(record)) {
    if (child && typeof child === "object") collectMarsCandidates(child, out);
  }
}

function extractJoGr850UrlsFromText(body: string): ReportRef[] {
  const result: ReportRef[] = [];
  const lines = body.split(/\r?\n/);
  const monthRegex =
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (!upper.includes("JO_GR850") || !upper.includes(".TXT")) continue;

    const m = line.match(/https?:\/\/[^\s,;"')]+/i);
    const url = m ? m[0] : null;
    if (!url) continue;

    const dm = line.match(monthRegex);
    const ts = dm ? parseMarsDate(dm[0]) : Date.now();
    result.push({ url: toAbsoluteUsdaUrl(url), ts });
  }

  return result;
}

async function discoverUsdaReports(): Promise<ReportRef[]> {
  try {
    const resp = await fetch(USDA_AMS_MARS_LIST_URL, {
      headers: { "user-agent": "CroptoBot/1.0", accept: "application/json,text/plain,*/*;q=0.8" },
    });

    if (!resp.ok) {
      console.warn(`[Backfill USDA] MARS non-OK: ${resp.status}, using fallback URL only.`);
      return [{ url: USDA_AMS_FALLBACK_URL, ts: Date.now() }];
    }

    const rawText = await resp.text();

    const candidates: ReportRef[] = [];
    try {
      const parsed = JSON.parse(rawText);
      collectMarsCandidates(parsed, candidates);
    } catch {
      candidates.push(...extractJoGr850UrlsFromText(rawText));
    }

    const uniq = new Map<string, ReportRef>();
    for (const c of candidates) {
      const existing = uniq.get(c.url);
      if (!existing || c.ts > existing.ts) uniq.set(c.url, c);
    }

    const out = Array.from(uniq.values()).sort((a, b) => b.ts - a.ts);
    if (out.length === 0) {
      console.warn("[Backfill USDA] MARS returned no JO_GR850 links, using fallback URL only.");
      return [{ url: USDA_AMS_FALLBACK_URL, ts: Date.now() }];
    }

    return out;
  } catch (error: any) {
    console.warn(`[Backfill USDA] MARS fetch failed: ${error.message}. Using fallback URL only.`);
    return [{ url: USDA_AMS_FALLBACK_URL, ts: Date.now() }];
  }
}

function normalizeReportDate(text: string): string {
  const m = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (!m) return new Date().toISOString().split("T")[0];
  const parsed = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().split("T")[0];
  return parsed.toISOString().split("T")[0];
}

function detectCommodity(line: string): Commodity | null {
  const lower = line.toLowerCase();
  if (lower.includes("soybean")) return "soybeans";
  if (lower.includes("corn") || lower.includes("maize")) return "maize";
  if (lower.includes("wheat") || lower.includes("hrw") || lower.includes("srw")) return "wheat";
  return null;
}

function detectLabel(line: string): string | null {
  const lower = line.toLowerCase();
  if (lower.includes("pacific northwest") || lower.includes("pnw")) return "US Export Bids (PNW)";
  if (lower.includes("gulf") || lower.includes("louisiana")) return "US Export Bids (Gulf)";
  if (lower.includes("st. louis") || lower.includes("st louis")) return "US Export Bids (St Louis)";
  if (lower.includes("interior")) return "US Export Bids (Interior)";
  return null;
}

function extractUsdPerTon(line: string, commodity: Commodity): number | null {
  if (!["maize", "wheat", "soybeans"].includes(commodity)) return null;

  const numeric = (line.match(/\d+(?:\.\d+)?/g) || [])
    .map((v) => Number.parseFloat(v))
    .filter((v) => Number.isFinite(v));

  if (numeric.length === 0) return null;

  const centsPerBushel = numeric.filter((v) => v >= 150 && v <= 2000);
  const usdPerBushel = numeric.filter((v) => v >= 2 && v <= 20);
  let bushelPrice = 0;

  if (centsPerBushel.length > 0) {
    bushelPrice = centsPerBushel[centsPerBushel.length - 1] / 100;
  } else if (usdPerBushel.length > 0) {
    bushelPrice = usdPerBushel[usdPerBushel.length - 1];
  } else {
    return null;
  }

  const kgPerBushel = BUSHEL_KG[commodity as keyof typeof BUSHEL_KG];
  const usdPerTon = bushelPrice * (1000 / kgPerBushel);
  if (!Number.isFinite(usdPerTon) || usdPerTon <= 0 || usdPerTon > 2000) return null;
  return Number(usdPerTon.toFixed(2));
}

async function fetchAndParseUsdaReport(reportUrl: string): Promise<IgcPrice[]> {
  const resp = await fetch(reportUrl, {
    headers: {
      "user-agent": "CroptoBot/1.0",
      accept: "text/plain,text/*;q=0.9,*/*;q=0.8",
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const text = await resp.text();
  const asOfDate = normalizeReportDate(text);
  const lines = text.split(/\r?\n/);
  const dedup = new Map<string, IgcPrice>();

  for (const line of lines) {
    const commodity = detectCommodity(line);
    if (!commodity) continue;

    const label = detectLabel(line);
    if (!label) continue;

    const priceUsdPerTon = extractUsdPerTon(line, commodity);
    if (!priceUsdPerTon) continue;

    const key = `${commodity}:${label}`;
    if (dedup.has(key)) continue;

    const spec = getUsdaSpec(commodity as "maize" | "wheat" | "soybeans");
    const confidence = priceUsdPerTon >= 100 && priceUsdPerTon <= 700 ? "high" : "medium";

    dedup.set(key, {
      commodity,
      country: "US",
      label,
      asOfDate,
      priceUsdPerTon,
      rawRow: { line: line.trim(), source: reportUrl },
      confidence,
      meta: {
        sourceUrl: reportUrl,
        discovery: "MARS_API_ARCHIVE",
        quoteUnitOriginal: "usd_per_bushel_or_cents_per_bushel",
        conversionApplied: {
          specId: spec.specId,
          conversionVersion: spec.conversionVersion,
        },
      },
    });
  }

  return Array.from(dedup.values());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseCli();
  const toDate = opts.to ? new Date(opts.to) : new Date();
  const fromDate = opts.from
    ? new Date(opts.from)
    : new Date(toDate.getTime() - opts.days * 24 * 60 * 60 * 1000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error("Invalid --from/--to date. Expected YYYY-MM-DD.");
  }

  console.log("[Backfill USDA] Starting...");
  console.log(`[Backfill USDA] Range: ${fromDate.toISOString().slice(0, 10)} .. ${toDate.toISOString().slice(0, 10)}`);
  console.log(`[Backfill USDA] Dry run: ${opts.dryRun ? "yes" : "no"}`);

  const discovered = await discoverUsdaReports();

  const filtered = discovered
    .filter((r) => r.ts >= fromDate.getTime() && r.ts <= toDate.getTime())
    .slice(0, opts.maxReports)
    .sort((a, b) => a.ts - b.ts);

  console.log(`[Backfill USDA] Discovered reports: ${discovered.length}, in range: ${filtered.length}`);

  let reportOk = 0;
  let reportFailed = 0;
  let parsedRows = 0;
  let upsertedRows = 0;

  for (const [idx, ref] of filtered.entries()) {
    const d = new Date(ref.ts).toISOString().slice(0, 10);
    process.stdout.write(`[Backfill USDA] [${idx + 1}/${filtered.length}] ${d} ${ref.url} ... `);

    try {
      const prices = await fetchAndParseUsdaReport(ref.url);
      parsedRows += prices.length;

      if (prices.length === 0) {
        reportFailed += 1;
        process.stdout.write("parsed 0 rows\n");
      } else if (opts.dryRun) {
        reportOk += 1;
        process.stdout.write(`parsed ${prices.length} rows (dry-run)\n`);
      } else {
        const inserted = await upsertIgcIndexPrices(prices, "USDA_AMS");
        upsertedRows += inserted;
        reportOk += 1;
        process.stdout.write(`parsed ${prices.length}, upserted ${inserted}\n`);
      }
    } catch (error: any) {
      reportFailed += 1;
      process.stdout.write(`failed (${error.message})\n`);
    }

    if (opts.sleepMs > 0) {
      await sleep(opts.sleepMs);
    }
  }

  console.log("\n[Backfill USDA] Done.");
  console.log(`[Backfill USDA] reports ok=${reportOk}, failed=${reportFailed}`);
  console.log(`[Backfill USDA] parsedRows=${parsedRows}, upsertedRows=${upsertedRows}`);

  if (!opts.dryRun) {
    console.log("[Backfill USDA] Next: run dashboard and history checks for US series.");
  }
}

main().catch((error) => {
  console.error("[Backfill USDA] Fatal:", error);
  process.exit(1);
});
