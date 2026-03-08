import * as cheerio from "cheerio";
import {
  ENABLE_IMF_PCPS_WIDGET,
  IMF_PCPS_CACHE_TTL_MS,
  IMF_PCPS_PAGE_URL,
  IMF_PCPS_TABLE2_URL,
  IMF_PCPS_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetImfCommodityBenchmarks, GrainWidgetImfCommodityBenchmarkRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { deriveSeries, fetchTextResponseWithTimeout } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetImfCommodityBenchmarks };
let cacheEntry: CacheEntry | null = null;

function parseRowsFromText(text: string): GrainWidgetImfCommodityBenchmarkRow[] {
  const targets = [
    { commodity: "WHEAT" as const, label: "Wheat", match: /^Wheat\b/im },
    { commodity: "MAIZE" as const, label: "Maize", match: /^Maize\b/im },
    { commodity: "SOYBEANS" as const, label: "Soybeans", match: /^Soybeans\b/im },
    { commodity: "SUNFLOWER_OIL" as const, label: "Sunflower oil", match: /^Sunflower oil\b/im },
    { commodity: "RAPESEED_OIL" as const, label: "Rapeseed oil", match: /^Rapeseed oil\b/im },
  ];
  return targets.flatMap((target) => {
    const match = text.match(new RegExp(`${target.match.source}[^\n\r]*`, "im"));
    const line = match?.[0];
    if (!line) return [];
    const nums = (line.match(/-?\d+(?:\.\d+)?/g) || []).map((v) => Number.parseFloat(v)).filter(Number.isFinite);
    const seriesValues = nums.slice(-8);
    if (!seriesValues.length) return [];
    const current = seriesValues[seriesValues.length - 1];
    const prev = seriesValues[seriesValues.length - 2];
    return [{
      commodity: target.commodity,
      label: target.label,
      current,
      unit: "USD/index basis",
      cadence: "monthly",
      changeAbs: prev != null ? Number((current - prev).toFixed(4)) : undefined,
      changePct: prev && prev !== 0 ? Number((((current - prev) / prev) * 100).toFixed(2)) : undefined,
      series: seriesValues.map((value, index) => ({ ...deriveSeries(current, prev != null ? current - prev : undefined, seriesValues.length)[index], value })),
      confidence: seriesValues.length >= 6 ? "MED" : "LOW",
      notes: ["Parsed from IMF primary commodity prices monthly table", "Unit label may need refinement from live metadata"],
    } satisfies GrainWidgetImfCommodityBenchmarkRow];
  });
}

export class ImfPcpsProvider implements GrainWidgetsProvider {
  id = "imf-pcps";
  kind = "IMF_COMMODITY_BENCHMARKS" as const;
  enabled = ENABLE_IMF_PCPS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "IMF_COMMODITY_BENCHMARKS" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetImfCommodityBenchmarks> {
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= IMF_PCPS_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const page = await fetchTextResponseWithTimeout(IMF_PCPS_PAGE_URL, IMF_PCPS_TIMEOUT_MS, { accept: "text/html,application/xhtml+xml,*/*" });
    const $ = cheerio.load(page.text);
    const updatedText = $.text().match(/Updated\s*:?\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}/i)?.[0];
    const tableText = await fetchTextResponseWithTimeout(IMF_PCPS_TABLE2_URL, IMF_PCPS_TIMEOUT_MS, { accept: "text/plain,application/pdf,*/*" });
    const rows = parseRowsFromText(tableText.text);
    if (!rows.length) throw new Error("imf_pcps_rows_empty");

    const widget: GrainWidgetImfCommodityBenchmarks = {
      id: "grain-imf-commodity-benchmarks",
      kind: "IMF_COMMODITY_BENCHMARKS",
      title: "IMF Commodity Benchmarks",
      subtitle: "Primary commodity price system",
      status: rows.length >= 3 ? "REFRESH" : "INDICATIVE",
      sourceName: "IMF",
      sourceAttribution: "Data: IMF primary commodity prices",
      sourceUrl: IMF_PCPS_TABLE2_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "GLOBAL",
      territory: { code: "GLOBAL", label: "Global" },
      rows,
      summary: {
        expectedCount: 4,
        mappedCount: rows.length,
        coverage: `${rows.length}/4`,
        cadence: "monthly",
      },
      notes: [updatedText || "Monthly IMF commodity benchmarks", "Benchmark layer; units kept explicit and conservative"],
      debug: {
        sourceUrlUsed: IMF_PCPS_TABLE2_URL,
        rowsParsed: rows.length,
        warnings: rows.some((row) => row.confidence === "LOW") ? ["some_rows_low_confidence"] : undefined,
      },
    };
    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
