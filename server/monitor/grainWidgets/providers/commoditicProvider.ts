import {
  COMMODITIC_API_KEY,
  COMMODITIC_API_URL,
  COMMODITIC_SOURCE_URL,
  ENABLE_COMMODITIC_WIDGETS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetGlobalSpotTable, GrainWidgetTableRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, normalizeDate, normalizeRowPrice, parseNumber, statusFromAvailability } from "./utils";

type CommoditicRow = {
  symbol?: string;
  instrument?: string;
  name?: string;
  last?: number | string;
  price?: number | string;
  change?: number | string;
  changePct?: number | string;
  updatedAt?: string | number;
  currency?: string;
  unit?: string;
};

const MAP: Array<{
  id: string;
  aliases: string[];
  label: string;
  region: string;
  commodityGroup: "Grains" | "Oilseeds";
  crop?: "corn" | "wheat" | "soybeans";
  nativeUnitType: "USD_PER_TON" | "EUR_PER_TON" | "UNKNOWN";
}> = [
  { id: "spot-wheat", aliases: ["wheat"], label: "Wheat", region: "Global", commodityGroup: "Grains", crop: "wheat", nativeUnitType: "USD_PER_TON" },
  { id: "spot-corn", aliases: ["corn", "maize"], label: "Corn", region: "Global", commodityGroup: "Grains", crop: "corn", nativeUnitType: "USD_PER_TON" },
  { id: "spot-soy", aliases: ["soy"], label: "Soybeans", region: "Global", commodityGroup: "Oilseeds", crop: "soybeans", nativeUnitType: "USD_PER_TON" },
  { id: "spot-rapeseed", aliases: ["rapeseed", "canola"], label: "Rapeseed", region: "EU", commodityGroup: "Oilseeds", nativeUnitType: "EUR_PER_TON" },
];

function flatten(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.results)) return input.results;
  if (Array.isArray(input.data)) return input.data;
  if (Array.isArray(input.prices)) return input.prices;
  return [];
}

function rowText(row: CommoditicRow): string {
  return `${row.symbol || ""} ${row.instrument || ""} ${row.name || ""}`.toLowerCase();
}

function coverage(rows: GrainWidgetTableRow[]) {
  return {
    ok: rows.filter((row) => row.price?.normalizationStatus === "OK").length,
    partial: rows.filter((row) => row.price?.normalizationStatus === "PARTIAL").length,
    fxMissing: rows.filter((row) => row.price?.normalizationStatus === "FX_MISSING").length,
    unavailable: rows.filter((row) => row.price?.normalizationStatus === "UNAVAILABLE" || !row.price?.normalizationStatus).length,
  };
}

export class CommoditicProvider implements GrainWidgetsProvider {
  id = "commoditic";
  kind = "GLOBAL_SPOT_TABLE" as const;
  enabled = ENABLE_COMMODITIC_WIDGETS;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "GLOBAL_SPOT_TABLE" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetGlobalSpotTable> {
    if (!COMMODITIC_API_URL) throw new Error("commoditic_api_url_missing");
    const headers: HeadersInit = {};
    if (COMMODITIC_API_KEY) headers.authorization = `Bearer ${COMMODITIC_API_KEY}`;
    const text = await fetchTextWithTimeout(COMMODITIC_API_URL, GRAIN_WIDGETS_FETCH_TIMEOUT_MS, headers);
    const payload = JSON.parse(text) as any;
    const sourceRows = flatten(payload);

    const rows: GrainWidgetTableRow[] = MAP.map((config) => {
      const source = sourceRows.find((row) => config.aliases.some((alias) => rowText(row).includes(alias)));
      const current = parseNumber(source?.last ?? source?.price);
      const change = parseNumber(source?.change);
      const changePct = parseNumber(source?.changePct);
      return normalizeRowPrice({
        row: {
          id: config.id,
          label: config.label,
          region: config.region,
          commodityGroup: config.commodityGroup,
          status: statusFromAvailability({ hasValue: current != null, delayed: true }),
          sourceName: "Commoditic",
          sourceAttribution: "Data: Commoditic",
          updatedAt: normalizeDate(source?.updatedAt) || ctx.now.toISOString(),
          price: {
            nativeValueCurrent: current,
            nativeValueChange: change,
            nativeValueChangePct: changePct,
            nativeCurrency: String(source?.currency || (config.nativeUnitType === "EUR_PER_TON" ? "EUR" : "USD")),
            nativeUnit: String(source?.unit || (config.nativeUnitType === "EUR_PER_TON" ? "EUR/t" : "USD/t")),
            normalizationStatus: "UNAVAILABLE",
          },
        },
        eurUsd: ctx.eurUsd,
        crop: config.crop,
        nativeUnitType: config.nativeUnitType,
      });
    });

    const available = rows.filter((row) => row.price?.nativeValueCurrent != null).length;
    const avgChange = rows
      .map((row) => row.price?.normalizedValueChangePct ?? row.price?.nativeValueChangePct)
      .filter((v): v is number => typeof v === "number");
    const mean = avgChange.length ? avgChange.reduce((sum, value) => sum + value, 0) / avgChange.length : 0;
    const momentumLabel = mean > 0.4 ? "Firm" : mean < -0.4 ? "Soft" : Math.abs(mean) < 0.2 ? "Flat" : "Mixed";

    return {
      id: "grain-global-spot",
      kind: "GLOBAL_SPOT_TABLE",
      title: "Spot (Global)",
      subtitle: "Wheat / Corn / Soy / Rapeseed",
      status: available ? "REFRESH" : "OFFLINE",
      sourceName: "Commoditic",
      sourceAttribution: "Data: Commoditic",
      sourceUrl: COMMODITIC_SOURCE_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      rows,
      summary: {
        rowCount: rows.length,
        momentumLabel,
        normalizedCoverage: coverage(rows),
      },
      notes: available < MAP.length ? [`${available}/${MAP.length} instruments available`] : undefined,
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetGlobalSpotTable {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetGlobalSpotTable;
  }
}
