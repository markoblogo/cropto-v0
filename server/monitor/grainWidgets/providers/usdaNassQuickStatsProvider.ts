import {
  ENABLE_USDA_NASS_WIDGET,
  USDA_NASS_API_KEY,
  USDA_NASS_BASE_URL,
  USDA_NASS_CACHE_TTL_MS,
  USDA_NASS_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetEcOfficialPricesSnapshot, GrainWidgetTableRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout, makeProviderError, normalizeRowPrice, parseNumber } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetEcOfficialPricesSnapshot };
type NassRow = { commodity: "corn" | "wheat" | "soybeans"; label: string; row: GrainWidgetTableRow; cadence: "annual" | "monthly" | "unknown" };

let cacheEntry: CacheEntry | null = null;

const cropConfig = [
  { commodity: "corn" as const, label: "Corn", params: { commodity_desc: "CORN", unit_desc: "$ / BU" } },
  { commodity: "wheat" as const, label: "Wheat", params: { commodity_desc: "WHEAT", unit_desc: "$ / BU" } },
  { commodity: "soybeans" as const, label: "Soybeans", params: { commodity_desc: "SOYBEANS", unit_desc: "$ / BU" } },
];

function buildUrl(extra: Record<string, string>): string {
  const params = new URLSearchParams({
    key: USDA_NASS_API_KEY,
    source_desc: "SURVEY",
    sector_desc: "CROPS",
    agg_level_desc: "NATIONAL",
    statisticcat_desc: "PRICE RECEIVED",
    format: "JSON",
    year__GE: String(new Date().getUTCFullYear() - 5),
    ...extra,
  });
  return `${USDA_NASS_BASE_URL}?${params.toString()}`;
}

function normalizeNassRows(payload: any[]): NassRow[] {
  const grouped = new Map<string, any[]>();
  for (const row of payload) {
    const commodity = String(row?.commodity_desc || "").toUpperCase();
    if (!grouped.has(commodity)) grouped.set(commodity, []);
    grouped.get(commodity)!.push(row);
  }

  return cropConfig.flatMap((config) => {
    const rows = (grouped.get(config.params.commodity_desc) || [])
      .filter((row) => parseNumber(row?.Value ?? row?.value) != null)
      .sort((a, b) => Number.parseInt(String(a?.year || 0), 10) - Number.parseInt(String(b?.year || 0), 10));
    if (!rows.length) return [];
    const latest = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : undefined;
    const current = parseNumber(latest?.Value ?? latest?.value);
    const previous = prev ? parseNumber(prev?.Value ?? prev?.value) : undefined;
    if (current == null) return [];
    const series = rows
      .map((row) => {
        const year = Number.parseInt(String(row?.year || row?.Year || ""), 10);
        const value = parseNumber(row?.Value ?? row?.value);
        if (!Number.isFinite(year) || value == null) return undefined;
        return { ts: new Date(Date.UTC(year, 0, 1)).toISOString(), value };
      })
      .filter((entry): entry is { ts: string; value: number } => Boolean(entry))
      .slice(-8);
    const unit = String(latest?.unit_desc || config.params.unit_desc || "").replace(/\$/g, "USD").replace(/\s+/g, "").replace("/BU", "/bu");
    return [{
      commodity: config.commodity,
      label: config.label,
      cadence: "annual" as const,
      row: normalizeRowPrice({
        row: {
          id: `usda-nass-${config.commodity}`,
          label: config.label,
          region: "United States",
          commodityGroup: config.commodity === "soybeans" ? "Oilseeds" : "Grains",
          sourceName: "USDA NASS QuickStats",
          sourceAttribution: "Data: USDA NASS QuickStats",
          updatedAt: new Date().toISOString(),
          status: "REFRESH",
          price: {
            nativeValueCurrent: current,
            nativeValueChange: previous != null ? Number((current - previous).toFixed(4)) : undefined,
            nativeValueChangePct: previous && previous !== 0 ? Number((((current - previous) / previous) * 100).toFixed(2)) : undefined,
            nativeCurrency: "USD",
            nativeUnit: unit || "USD/bu",
            normalizationStatus: "UNAVAILABLE",
            series,
          },
          notes: [
            "annual cadence",
            ...(latest?.short_desc ? [String(latest.short_desc)] : []),
          ],
        },
        eurUsd: null,
        crop: config.commodity,
        nativeUnitType: "USD_PER_BUSHEL",
      }),
    }];
  });
}

export class UsdaNassQuickStatsProvider implements GrainWidgetsProvider {
  id = "usda-nass-quickstats";
  kind = "USDA_NASS_PRODUCER_PRICES" as const;
  enabled = ENABLE_USDA_NASS_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "USDA_NASS_PRODUCER_PRICES" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetEcOfficialPricesSnapshot> {
    if (!USDA_NASS_API_KEY) {
      throw makeProviderError("usda_nass_api_key_missing", {
        errorKind: "CONFIG_MISSING",
      });
    }
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= USDA_NASS_CACHE_TTL_MS) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const allRows: any[] = [];
    const urls: string[] = [];
    for (const crop of cropConfig) {
      const url = buildUrl(crop.params);
      urls.push(url);
      const response = await fetchTextResponseWithTimeout(url, USDA_NASS_TIMEOUT_MS, { accept: "application/json,text/plain,*/*" });
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed?.data)) allRows.push(...parsed.data);
    }
    const mapped = normalizeNassRows(allRows);
    if (!mapped.length) {
      throw makeProviderError("usda_nass_rows_empty", {
        errorKind: "EMPTY",
      });
    }

    const widget: GrainWidgetEcOfficialPricesSnapshot = {
      id: "grain-usda-nass-producer-prices",
      kind: "USDA_NASS_PRODUCER_PRICES",
      title: "USDA NASS Producer Prices",
      subtitle: "Official US producer/statistical layer",
      status: mapped.length >= 3 ? "REFRESH" : "INDICATIVE",
      sourceName: "USDA NASS QuickStats",
      sourceAttribution: "Data: USDA NASS QuickStats API",
      sourceUrl: urls[0],
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_FIXED",
      territory: { code: "US", label: "United States" },
      rows: mapped.map((entry) => entry.row),
      summary: {
        expectedCount: 3,
        mappedCount: mapped.length,
        coverage: `${mapped.length}/3`,
        cadence: "annual",
        selectedTerritory: "US",
      },
      notes: ["Official USDA NASS producer prices", "Annual cadence; sparkline remains conservative"],
      debug: {
        sourceUrlUsed: urls[0],
        query: urls[0].split("?")[1] || "",
        rowsParsed: allRows.length,
      },
    };

    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
