import {
  ENABLE_USDA_PSD_WIDGET,
  USDA_FAS_API_KEY,
  USDA_FAS_OPENDATA_BASE_URL,
  USDA_PSD_CACHE_TTL_MS,
  USDA_PSD_MAX_YEARS,
  USDA_PSD_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetUsdaPsdBalances, GrainWidgetUsdPsdBalanceRow } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout, parseNumber } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetUsdaPsdBalances };
let cacheEntry: CacheEntry | null = null;

const commodityMap = [
  { code: "WHEAT", label: "Wheat" },
  { code: "CORN", label: "Corn" },
  { code: "SOYBEANS", label: "Soybeans" },
  { code: "RAPESEED", label: "Rapeseed" },
] as const;

const metricMap = [
  { code: "PRODUCTION", label: "Production" },
  { code: "CONSUMPTION", label: "Consumption" },
  { code: "EXPORTS", label: "Exports" },
  { code: "ENDING_STOCKS", label: "Ending stocks" },
] as const;

function buildUrl(): string {
  const url = new URL(`${USDA_FAS_OPENDATA_BASE_URL.replace(/\/+$/, "")}/psd/world-commodity-balances`);
  if (USDA_FAS_API_KEY) url.searchParams.set("api_key", USDA_FAS_API_KEY);
  url.searchParams.set("years", String(USDA_PSD_MAX_YEARS));
  return url.toString();
}

function getArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.value)) return payload.value;
  return [];
}

function normalizeRows(payload: any[]): GrainWidgetUsdPsdBalanceRow[] {
  const out: GrainWidgetUsdPsdBalanceRow[] = [];
  for (const commodity of commodityMap) {
    for (const metric of metricMap) {
      const matched = payload
        .filter((row) => {
          const commodityLabel = String(row?.commodity || row?.commodity_name || row?.commodityCode || row?.commodity_code || "").toUpperCase();
          const metricLabel = String(row?.attribute || row?.attribute_name || row?.metric || row?.element || "").toUpperCase().replace(/\s+/g, "_");
          return commodityLabel.includes(commodity.code) && metricLabel.includes(metric.code);
        })
        .map((row) => {
          const year = Number.parseInt(String(row?.marketYear || row?.year || row?.marketing_year || ""), 10);
          const value = parseNumber(row?.value ?? row?.amount ?? row?.Value);
          if (!Number.isFinite(year) || value == null) return undefined;
          return {
            ts: new Date(Date.UTC(year, 0, 1)).toISOString(),
            value,
            unit: String(row?.unit || row?.unit_name || "million tonnes").trim() || "million tonnes",
          };
        })
        .filter((row): row is { ts: string; value: number; unit: string } => Boolean(row))
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
      if (!matched.length) continue;
      const latest = matched[matched.length - 1];
      const prev = matched[matched.length - 2];
      out.push({
        commodity: commodity.code,
        metric: metric.code,
        label: `${commodity.label} ${metric.label}`,
        current: latest.value,
        unit: latest.unit,
        cadence: "marketing-year",
        changeAbs: prev ? Number((latest.value - prev.value).toFixed(4)) : undefined,
        changePct: prev && prev.value !== 0 ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2)) : undefined,
        series: matched.slice(-Math.max(4, USDA_PSD_MAX_YEARS)).map((row) => ({ ts: row.ts, value: row.value })),
        confidence: matched.length >= 5 ? "HIGH" : "MED",
      });
    }
  }
  return out;
}

export class UsdaPsdProvider implements GrainWidgetsProvider {
  id = "usda-psd";
  kind = "USDA_PSD_BALANCES" as const;
  enabled = ENABLE_USDA_PSD_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "USDA_PSD_BALANCES" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUsdaPsdBalances> {
    if (!USDA_FAS_API_KEY) throw new Error("usda_fas_api_key_missing");
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= USDA_PSD_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const url = buildUrl();
    const response = await fetchTextResponseWithTimeout(url, USDA_PSD_TIMEOUT_MS, { accept: "application/json,text/plain,*/*" });
    const rows = normalizeRows(getArray(JSON.parse(response.text)));
    if (!rows.length) throw new Error("usda_psd_rows_empty");

    const widget: GrainWidgetUsdaPsdBalances = {
      id: "grain-usda-psd-balances",
      kind: "USDA_PSD_BALANCES",
      title: "USDA PSD Balances",
      subtitle: "World supply/demand balance sheet",
      status: rows.length >= 6 ? "REFRESH" : "INDICATIVE",
      sourceName: "USDA FAS OpenData",
      sourceAttribution: "Data: USDA PSD / FAS OpenData",
      sourceUrl: url.replace(USDA_FAS_API_KEY, "REDACTED"),
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "GLOBAL",
      territory: { code: "GLOBAL", label: "Global" },
      rows,
      summary: {
        expectedCount: 8,
        mappedCount: rows.length,
        coverage: `${rows.length}/8`,
        cadence: "marketing-year",
        selectedView: "WORLD",
      },
      notes: ["Global balance sheet / marketing-year cadence", "Sparse series keep trend rendering conservative"],
      debug: {
        sourceUrlUsed: url.replace(USDA_FAS_API_KEY, "REDACTED"),
        query: url.includes("?") ? url.split("?")[1].replace(USDA_FAS_API_KEY, "REDACTED") : "",
        rowsParsed: rows.length,
      },
    };
    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
