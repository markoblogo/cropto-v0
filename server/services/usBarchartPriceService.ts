import { chromium } from "playwright";
import * as cheerio from "cheerio";
import type { IgcPrice } from "./igcPriceService";
import { normalizeExternalCommodityName, usdPerBushelToTon } from "./externalCommodity";

const BARCHART_GRAIN_INDEX_URL =
  process.env.BARCHART_GRAIN_INDEX_URL || "https://www.barchart.com/cmdty/indexes/grain";

function extractIndexRows(html: string): Array<{ commodity: string; label: string; valueUsdPerBushel: number }> {
  const $ = cheerio.load(html);
  const bodyText = $("body").text();
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result: Array<{ commodity: string; label: string; valueUsdPerBushel: number }> = [];
  for (const line of lines) {
    if (!/\bus\b/i.test(line) || !/\bprice idx\b/i.test(line)) continue;
    const nameMatch = line.match(/(us\s+.+?\s+price idx)/i);
    if (!nameMatch) continue;
    const nums = (line.match(/\d+(?:\.\d+)?/g) || [])
      .map((v) => Number.parseFloat(v))
      .filter((n) => Number.isFinite(n) && n > 1 && n < 50);
    if (nums.length === 0) continue;
    const title = nameMatch[1].replace(/\s+/g, " ").trim();
    const commodity = normalizeExternalCommodityName(title);
    result.push({
      commodity,
      label: `US National Index (${title.replace(/^us\s+/i, "").replace(/\s+price idx$/i, "").trim()})`,
      valueUsdPerBushel: nums[nums.length - 1],
    });
  }

  const dedup = new Map<string, { commodity: string; label: string; valueUsdPerBushel: number }>();
  for (const row of result) {
    dedup.set(`${row.commodity}:${row.label.toLowerCase()}`, row);
  }
  if (dedup.size === 0) {
    for (const line of lines) {
      const low = line.toLowerCase();
      if (!(low.includes("corn") || low.includes("soybean") || low.includes("wheat"))) continue;
      if (!low.includes("price idx")) continue;
      const nums = (line.match(/\d+(?:\.\d+)?/g) || [])
        .map((v) => Number.parseFloat(v))
        .filter((n) => Number.isFinite(n) && n > 1 && n < 50);
      if (nums.length === 0) continue;
      const commodity = normalizeExternalCommodityName(line);
      dedup.set(`${commodity}:${line.toLowerCase()}`, {
        commodity,
        label: "US National Index (Discovered)",
        valueUsdPerBushel: nums[nums.length - 1],
      });
    }
  }
  return Array.from(dedup.values());
}

export async function fetchUsBarchartPrices(): Promise<IgcPrice[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    });

    await page.goto(BARCHART_GRAIN_INDEX_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);
    const html = await page.content();
    const rows = extractIndexRows(html);

    const asOfDate = new Date().toISOString().slice(0, 10);
    const parsed: IgcPrice[] = [];
    for (const row of rows) {
      const converted = usdPerBushelToTon(row.valueUsdPerBushel, row.commodity);
      if (!(converted && converted.value > 0)) continue;
      parsed.push({
        commodity: row.commodity,
        country: "US",
        label: row.label,
        asOfDate,
        priceUsdPerTon: converted.value,
        confidence: "medium",
        rawRow: { source: BARCHART_GRAIN_INDEX_URL, valueUsdPerBushel: String(row.valueUsdPerBushel) },
        meta: {
          sourceUrl: BARCHART_GRAIN_INDEX_URL,
          quoteUnitOriginal: "usd_per_bushel",
          conversionApplied: {
            method: "bushel_to_ton",
            conversionVersion: "v3-discovery",
            kgPerBushel: converted.kgPerBushel,
            approximate: converted.approximate,
          },
        },
      });
    }

    console.log(`[Barchart] Parsed ${parsed.length} US index rows`);
    return parsed;
  } catch (error: any) {
    console.error("[Barchart] Fetch failed:", error?.message || error);
    return [];
  } finally {
    await browser.close();
  }
}
