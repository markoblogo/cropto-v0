import { chromium } from "playwright";
import * as cheerio from "cheerio";
import type { IgcPrice } from "./igcPriceService";

const BARCHART_GRAIN_INDEX_URL =
  process.env.BARCHART_GRAIN_INDEX_URL || "https://www.barchart.com/cmdty/indexes/grain";

const BUSHEL_KG: Record<"maize" | "wheat" | "soybeans", number> = {
  maize: 25.40117272,
  wheat: 27.2155422,
  soybeans: 27.2155422,
};

function usdPerBushelToTon(price: number, commodity: "maize" | "wheat" | "soybeans"): number {
  const kg = BUSHEL_KG[commodity];
  return Number((price * (1000 / kg)).toFixed(2));
}

function extractIndexRows(html: string): Array<{ name: string; value: number }> {
  const $ = cheerio.load(html);
  const bodyText = $("body").text();
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const targets = [
    { key: "us corn price idx", commodity: "maize" as const, label: "US National Index (Corn)" },
    { key: "us soybean price idx", commodity: "soybeans" as const, label: "US National Index (Soybeans)" },
    { key: "us wheat price idx", commodity: "wheat" as const, label: "US National Index (Wheat)" },
  ];

  const result: Array<{ name: string; value: number }> = [];
  for (const target of targets) {
    const line = lines.find((l) => l.toLowerCase().includes(target.key));
    if (!line) continue;
    const nums = (line.match(/\d+(?:\.\d+)?/g) || [])
      .map((v) => Number.parseFloat(v))
      .filter((n) => Number.isFinite(n) && n > 1 && n < 50);
    if (nums.length === 0) continue;
    result.push({ name: `${target.commodity}:${target.label}`, value: nums[nums.length - 1] });
  }

  return result;
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
      const [commodity, label] = row.name.split(":");
      if (commodity !== "maize" && commodity !== "wheat" && commodity !== "soybeans") continue;
      const priceUsdPerTon = usdPerBushelToTon(row.value, commodity);
      if (!(priceUsdPerTon > 0)) continue;
      parsed.push({
        commodity,
        country: "US",
        label,
        asOfDate,
        priceUsdPerTon,
        confidence: "medium",
        rawRow: { source: BARCHART_GRAIN_INDEX_URL, valueUsdPerBushel: String(row.value) },
        meta: {
          sourceUrl: BARCHART_GRAIN_INDEX_URL,
          quoteUnitOriginal: "usd_per_bushel",
          conversionApplied: { method: "bushel_to_ton", conversionVersion: "v1" },
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

