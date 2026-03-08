import * as cheerio from "cheerio";
import {
  ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET,
  OECD_AGRICULTURAL_OUTLOOK_CACHE_TTL_MS,
  OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
  OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL,
  OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetOecdAgriculturalOutlook, GrainWidgetOecdAgriculturalOutlookItem } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetOecdAgriculturalOutlook };
let cacheEntry: CacheEntry | null = null;

function extractMatch(text: string, patterns: RegExp[]): { value: number; unit: string; horizon: string } | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(match[1]);
    const horizon = match[2] || "2034";
    const unit = match[3] || "value";
    if (Number.isFinite(value)) return { value, unit, horizon };
  }
  return undefined;
}

export class OecdAgriculturalOutlookProvider implements GrainWidgetsProvider {
  id = "oecd-agricultural-outlook";
  kind = "OECD_AGRICULTURAL_OUTLOOK" as const;
  enabled = ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "OECD_AGRICULTURAL_OUTLOOK" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetOecdAgriculturalOutlook> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= OECD_AGRICULTURAL_OUTLOOK_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const cerealsPage = await fetchTextResponseWithTimeout(OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL, OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS, { accept: "text/html,application/xhtml+xml,*/*" });
    const oilseedsPage = await fetchTextResponseWithTimeout(OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL, OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS, { accept: "text/html,application/xhtml+xml,*/*" });
    const cerealsText = cheerio.load(cerealsPage.text).text().replace(/\s+/g, " ");
    const oilseedsText = cheerio.load(oilseedsPage.text).text().replace(/\s+/g, " ");
    const releaseDate = cerealsText.match(/\b\d{4}-\d{4}\b/)?.[0] || cerealsText.match(/2025-2034/)?.[0];

    const items: GrainWidgetOecdAgriculturalOutlookItem[] = [];
    const wheat = extractMatch(cerealsText, [/wheat prices?[^.]*?reach(?:ing)?\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?by\s+(\d{4})/i, /wheat prices?[^.]*?to\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?(\d{4})/i]);
    if (wheat) items.push({ id: "oecd-wheat", commodity: "WHEAT", label: "Wheat projected price", projectedValue: wheat.value, unit: wheat.unit === "value" ? "USD/t" : wheat.unit, horizon: wheat.horizon, cadence: "annual", confidence: "MED", notes: ["OECD-FAO outlook projection"] });
    const maize = extractMatch(cerealsText, [/maize prices?[^.]*?reach(?:ing)?\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?by\s+(\d{4})/i, /maize prices?[^.]*?to\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?(\d{4})/i]);
    if (maize) items.push({ id: "oecd-maize", commodity: "MAIZE", label: "Maize projected price", projectedValue: maize.value, unit: maize.unit === "value" ? "USD/t" : maize.unit, horizon: maize.horizon, cadence: "annual", confidence: "MED", notes: ["OECD-FAO outlook projection"] });
    const soy = extractMatch(oilseedsText, [/soybean prices?[^.]*?reach(?:ing)?\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?by\s+(\d{4})/i, /soybean prices?[^.]*?to\s+USD\s*(\d+(?:\.\d+)?)\/?t[^.]*?(\d{4})/i]);
    if (soy) items.push({ id: "oecd-soybeans", commodity: "SOYBEANS", label: "Soybean projected price", projectedValue: soy.value, unit: soy.unit === "value" ? "USD/t" : soy.unit, horizon: soy.horizon, cadence: "annual", confidence: "MED", notes: ["OECD-FAO outlook projection"] });
    const rapeseed = extractMatch(oilseedsText, [/rapeseed[^.]*?production[^.]*?(\d+(?:\.\d+)?)\s*(Mt|million tonnes)[^.]*?by\s+(\d{4})/i]);
    if (rapeseed) items.push({ id: "oecd-rapeseed", commodity: "RAPESEED", label: "Rapeseed projected production", projectedValue: rapeseed.value, unit: rapeseed.unit, horizon: rapeseed.horizon, cadence: "annual", confidence: "LOW", notes: ["Structural outlook metric"] });
    const sunflower = extractMatch(oilseedsText, [/sunflower[^.]*?production[^.]*?(\d+(?:\.\d+)?)\s*(Mt|million tonnes)[^.]*?by\s+(\d{4})/i]);
    if (sunflower) items.push({ id: "oecd-sunflower", commodity: "SUNFLOWER", label: "Sunflower projected production", projectedValue: sunflower.value, unit: sunflower.unit, horizon: sunflower.horizon, cadence: "annual", confidence: "LOW", notes: ["Structural outlook metric"] });
    if (!items.length) throw new Error("oecd_outlook_items_empty");

    const widget: GrainWidgetOecdAgriculturalOutlook = {
      id: "grain-oecd-agricultural-outlook",
      kind: "OECD_AGRICULTURAL_OUTLOOK",
      title: "OECD Agricultural Outlook",
      subtitle: "Forecast / structural regime layer",
      status: items.length >= 2 ? "REFRESH" : "INDICATIVE",
      sourceName: "OECD-FAO Outlook",
      sourceAttribution: "Data: OECD-FAO Agricultural Outlook",
      sourceUrl: OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "GLOBAL",
      territory: { code: "GLOBAL", label: "Global" },
      items,
      summary: {
        expectedCount: 5,
        mappedCount: items.length,
        coverage: `${items.length}/5`,
        cadence: "annual",
        releaseDate,
        horizon: items[0]?.horizon,
      },
      notes: ["Forecast/outlook widget; not a live market price source", "Projection values extracted conservatively from OECD outlook text"],
      debug: {
        sourceUrlUsed: `${OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL} | ${OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL}`,
        rowsParsed: items.length,
        warnings: items.some((item) => item.confidence === "LOW") ? ["some_projection_matches_low_confidence"] : undefined,
      },
    };
    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
