/**
 * USDA AMS Export Grain Bids service (JO_GR850 txt)
 * Best-effort parser for US export bid snapshots mapped to internal index schema.
 */

import type { IgcPrice } from "./igcPriceService";
import { getUsdaSpec } from "./specRegistry";

const USDA_AMS_URL =
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

function normalizeReportDate(text: string): string {
  const dateMatch = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (!dateMatch) return new Date().toISOString().split("T")[0];
  const parsed = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
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

function detectCommoditySection(line: string): Commodity | null {
  const lower = line.toLowerCase();
  if (
    lower.includes("soybean export bids") ||
    lower.includes("soybeans export bids") ||
    lower.includes("soybean bids")
  ) {
    return "soybeans";
  }
  if (
    lower.includes("corn export bids") ||
    lower.includes("maize export bids") ||
    lower.includes("corn bids")
  ) {
    return "maize";
  }
  if (
    lower.includes("wheat export bids") ||
    lower.includes("wheat bids") ||
    lower.includes("hrw export") ||
    lower.includes("srw export")
  ) {
    return "wheat";
  }
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

function parseUsdaLinesToPrices(lines: string[], reportUrl: string, asOfDate: string): IgcPrice[] {
  const dedup = new Map<string, IgcPrice>();
  let sectionCommodity: Commodity | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const explicitSection = detectCommoditySection(line);
    if (explicitSection) {
      sectionCommodity = explicitSection;
      continue;
    }

    const inlineCommodity = detectCommodity(line);
    const commodity = inlineCommodity || sectionCommodity;
    if (!commodity) continue;

    const label = detectLabel(line);
    if (!label) continue;

    const priceUsdPerTon = extractUsdPerTon(line, commodity);
    if (!priceUsdPerTon) continue;

    const key = `${commodity}:${label}`;
    if (!dedup.has(key)) {
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
          discovery: "MARS_API",
          quoteUnitOriginal: "usd_per_bushel_or_cents_per_bushel",
          conversionApplied: {
            specId: spec.specId,
            conversionVersion: spec.conversionVersion,
          },
        },
      });
    }
  }

  return Array.from(dedup.values());
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

function collectMarsCandidates(node: unknown, out: Array<{ url: string; ts: number }>) {
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
      const looksLikeUrl =
        keyUpper.includes("URL") ||
        keyUpper.includes("LINK") ||
        keyUpper.includes("FILE");
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
    if (child && typeof child === "object") {
      collectMarsCandidates(child, out);
    }
  }
}

async function resolveUsdaTxtUrl(): Promise<string> {
  try {
    const resp = await fetch(USDA_AMS_MARS_LIST_URL, {
      headers: { "user-agent": "CroptoBot/1.0", accept: "application/json,*/*;q=0.8" },
    });
    if (!resp.ok) return USDA_AMS_URL;
    const data = await resp.json();
    const candidates: Array<{ url: string; ts: number }> = [];
    collectMarsCandidates(data, candidates);
    if (candidates.length === 0) return USDA_AMS_URL;
    candidates.sort((a, b) => b.ts - a.ts);
    return candidates[0].url || USDA_AMS_URL;
  } catch {
    return USDA_AMS_URL;
  }
}

export async function fetchUsdaAmsPrices(): Promise<IgcPrice[]> {
  try {
    const reportUrl = await resolveUsdaTxtUrl();
    console.log(`[USDA AMS] Fetching ${reportUrl}`);
    const resp = await fetch(reportUrl, {
      headers: {
        "user-agent": "CroptoBot/1.0",
        accept: "text/plain,text/*;q=0.9,*/*;q=0.8",
      },
    });
    if (!resp.ok) {
      console.warn(`[USDA AMS] Non-OK response: ${resp.status}`);
      return [];
    }

    const text = await resp.text();
    const asOfDate = normalizeReportDate(text);
    const lines = text.split(/\r?\n/);
    const result = parseUsdaLinesToPrices(lines, reportUrl, asOfDate);
    console.log(`[USDA AMS] Parsed ${result.length} price rows for ${asOfDate}`);
    return result;
  } catch (error: any) {
    console.error(`[USDA AMS] Fetch failed: ${error.message}`);
    return [];
  }
}
