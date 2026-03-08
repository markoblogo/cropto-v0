import {
  ENABLE_WFP_MARKET_PRICES_WIDGET,
  WFP_DATABRIDGES_BASE_URL,
  WFP_DATABRIDGES_CACHE_TTL_MS,
  WFP_DATABRIDGES_COUNTRIES,
  WFP_DATABRIDGES_MAX_RECORDS,
  WFP_DATABRIDGES_TIMEOUT_MS,
  WFP_DATABRIDGES_TOKEN,
} from "../config";
import type {
  GrainWidgetCountryMarketPriceRow,
  GrainWidgetPoint,
  GrainWidgetWfpMarketPricesMultiCountry,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout, parseNumber } from "./utils";

type TerritoryCode = "UA" | "US" | "BR" | "AR" | "EU";
type CacheEntry = { fetchedAt: number; territory: TerritoryCode; widget: GrainWidgetWfpMarketPricesMultiCountry };
type WfpRow = Record<string, unknown>;

let cacheEntry: CacheEntry | null = null;

const territoryLabels: Record<TerritoryCode, string> = {
  UA: "Ukraine",
  US: "United States",
  BR: "Brazil",
  AR: "Argentina",
  EU: "European Union",
};

const iso3ByTerritory: Record<Exclude<TerritoryCode, "EU">, string> = {
  UA: "UKR",
  US: "USA",
  BR: "BRA",
  AR: "ARG",
};

const cropPatterns = [
  { crop: "WHEAT" as const, label: "Wheat", patterns: [/wheat/i] },
  { crop: "MAIZE" as const, label: "Maize (Corn)", patterns: [/maize/i, /\bcorn\b/i] },
  { crop: "SOY" as const, label: "Soybeans", patterns: [/soy/i, /soybean/i] },
];

function territoryFromCountry(raw?: string): { code: TerritoryCode; label: string } {
  const code = String(raw || "UA").toUpperCase() as TerritoryCode;
  if (code in territoryLabels) return { code, label: territoryLabels[code] };
  return { code: "UA", label: territoryLabels.UA };
}

function getArray(payload: any): WfpRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function cadenceFromSeries(series: GrainWidgetPoint[]): GrainWidgetCountryMarketPriceRow["cadence"] {
  if (series.length < 3) return "unknown";
  const diffs = series
    .map((point) => Date.parse(point.ts))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .slice(1)
    .map((value, index, all) => Math.round((value - (series.map((point) => Date.parse(point.ts)).filter(Number.isFinite).sort((a, b) => a - b)[index] || value)) / 86_400_000))
    .filter((value) => value > 0);
  const median = diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)] || 0;
  if (median <= 10) return "weekly";
  if (median <= 40) return "monthly";
  return "annual";
}

function chooseMarketGroup(rows: WfpRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const market = String(row.market_name || row.market || row.market_label || "national").trim() || "national";
    counts.set(market, (counts.get(market) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "national";
}

function mapRows(rows: WfpRow[], territory: { code: TerritoryCode; label: string }): GrainWidgetCountryMarketPriceRow[] {
  const grouped = new Map<string, Array<{ ts: string; value: number; unit: string; market: string }>>();
  for (const row of rows) {
    const commodity = String(row.commodity || row.commodity_name || row.item || row.product || "").trim();
    const matched = cropPatterns.find((entry) => entry.patterns.some((pattern) => pattern.test(commodity)));
    if (!matched) continue;
    const value = parseNumber(row.price ?? row.value ?? row.mp_price ?? row.monthly_price);
    const tsRaw = String(row.date || row.month || row.period || row.reference_period || "").trim();
    const ts = tsRaw ? (Number.isFinite(Date.parse(tsRaw)) ? new Date(Date.parse(tsRaw)).toISOString() : /^\d{4}-\d{2}$/.test(tsRaw) ? `${tsRaw}-01T00:00:00.000Z` : undefined) : undefined;
    if (value == null || !ts) continue;
    const unit = String(row.unit || row.unit_name || row.price_unit || row.currency || "native").trim() || "native";
    const market = String(row.market_name || row.market || row.market_label || "national").trim() || "national";
    const key = `${matched.crop}::${unit}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ ts, value, unit, market });
  }

  return [...grouped.entries()].map(([key, entries]) => {
    const [crop] = key.split("::");
    const config = cropPatterns.find((entry) => entry.crop === crop)!;
    const chosenMarket = chooseMarketGroup(entries);
    const series = entries
      .filter((entry) => entry.market === chosenMarket)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .slice(-12)
      .map((entry) => ({ ts: entry.ts, value: Number(entry.value.toFixed(4)) }));
    const latest = series[series.length - 1];
    const previous = series[series.length - 2];
    return {
      crop: config.crop,
      label: config.label,
      current: latest?.value || 0,
      unit: entries[entries.length - 1]?.unit || "native",
      cadence: cadenceFromSeries(series),
      changeAbs: latest && previous ? Number((latest.value - previous.value).toFixed(4)) : undefined,
      changePct: latest && previous && previous.value !== 0 ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(2)) : undefined,
      series,
      confidence: series.length >= 6 ? "HIGH" : "MED",
      notes: chosenMarket !== "national" ? [`market_rule:primary_market=${chosenMarket}`] : undefined,
      territory: { code: territory.code, label: territory.label },
    } satisfies GrainWidgetCountryMarketPriceRow;
  }).filter((row) => row.current !== 0);
}

export class WfpDataBridgesProvider implements GrainWidgetsProvider {
  id = "wfp-databridges";
  kind = "WFP_MARKET_PRICES_MULTI_COUNTRY" as const;
  enabled = ENABLE_WFP_MARKET_PRICES_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "WFP_MARKET_PRICES_MULTI_COUNTRY" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetWfpMarketPricesMultiCountry> {
    if (!WFP_DATABRIDGES_TOKEN) throw new Error("wfp_databridges_token_missing");
    const territory = territoryFromCountry(ctx.country);
    if (territory.code === "EU") throw new Error("wfp_databridges_eu_not_supported");
    const now = Date.now();
    if (cacheEntry && cacheEntry.territory === territory.code && now - cacheEntry.fetchedAt <= WFP_DATABRIDGES_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const url = new URL(WFP_DATABRIDGES_BASE_URL);
    url.searchParams.set("app_identifier", WFP_DATABRIDGES_TOKEN);
    url.searchParams.set("location_code", iso3ByTerritory[territory.code as Exclude<TerritoryCode, "EU">]);
    url.searchParams.set("limit", String(WFP_DATABRIDGES_MAX_RECORDS));
    const response = await fetchTextResponseWithTimeout(url.toString(), WFP_DATABRIDGES_TIMEOUT_MS, {
      accept: "application/json,text/plain,*/*",
    });
    const parsed = JSON.parse(response.text);
    const rows = mapRows(getArray(parsed), territory);
    if (!rows.length) throw new Error(`wfp_rows_empty:${territory.code}`);

    const widget: GrainWidgetWfpMarketPricesMultiCountry = {
      id: "grain-wfp-market-prices",
      kind: "WFP_MARKET_PRICES_MULTI_COUNTRY",
      title: "WFP Market Prices",
      subtitle: "WFP HAPI / market surveillance layer",
      status: rows.length >= 2 ? "REFRESH" : "INDICATIVE",
      sourceName: "WFP HAPI",
      sourceAttribution: "Data: WFP DataBridges / HAPI food prices",
      sourceUrl: url.toString().replace(WFP_DATABRIDGES_TOKEN, "REDACTED"),
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_MULTI",
      territory: { code: territory.code, label: territory.label },
      supportedTerritories: WFP_DATABRIDGES_COUNTRIES.map((code) => ({ code, label: territoryLabels[code as TerritoryCode] || code })),
      territorySelector: {
        paramName: "country",
        default: WFP_DATABRIDGES_COUNTRIES[0] || "UA",
        current: territory.code,
        persistKey: "monitor_country_WFP_MARKET_PRICES_MULTI_COUNTRY",
      },
      rows,
      summary: {
        expectedCount: 3,
        mappedCount: rows.length,
        coverage: `${rows.length}/3`,
        cadence: rows[0]?.cadence || "unknown",
        selectedTerritory: territory.code,
      },
      notes: ["Native units preserved", "Primary market rule used when national aggregate is unavailable"],
      debug: {
        sourceUrlUsed: url.toString().replace(WFP_DATABRIDGES_TOKEN, "REDACTED"),
        query: url.searchParams.toString().replace(WFP_DATABRIDGES_TOKEN, "REDACTED"),
        rowsParsed: getArray(parsed).length,
        marketRule: "most_frequent_market",
      },
    };
    cacheEntry = { fetchedAt: now, territory: territory.code, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
