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
import { fetchTextResponseWithTimeout, makeProviderError, parseNumber, redactSensitiveQuery, redactSensitiveUrl } from "./utils";

type CacheEntry = { fetchedAt: number; widget: GrainWidgetUsdaPsdBalances };
let cacheEntry: CacheEntry | null = null;
const LIVE_YEARS_BUDGET = Math.min(2, Math.max(1, USDA_PSD_MAX_YEARS));

const commodityMap = [
  { code: "WHEAT", label: "Wheat" },
  { code: "CORN", label: "Corn" },
  { code: "SOYBEANS", label: "Soybeans" },
  { code: "RAPESEED", label: "Rapeseed" },
] as const;

const metricMap = [
  { code: "PRODUCTION", label: "Production", patterns: ["production"] },
  { code: "CONSUMPTION", label: "Consumption", patterns: ["domestic consumption", "consumption"] },
  { code: "EXPORTS", label: "Exports", patterns: ["exports", "export"] },
  { code: "ENDING_STOCKS", label: "Ending stocks", patterns: ["ending stocks", "ending stock"] },
] as const;

function normalizeToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\s/-]+/g, " ")
    .trim();
}

function buildEndpoint(path: string): string {
  const base = USDA_FAS_OPENDATA_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = `/${String(path || "").replace(/^\/+/, "")}`;
  const dedupedPath = normalizedPath.replace(/^\/api\//i, "/");
  return `${base}${dedupedPath}`;
}

function authHeaders(): HeadersInit {
  return {
    accept: "application/json,text/plain,*/*",
    API_KEY: USDA_FAS_API_KEY,
  };
}

async function fetchJson(path: string) {
  const url = buildEndpoint(path);
  try {
    const response = await fetchTextResponseWithTimeout(url, USDA_PSD_TIMEOUT_MS, authHeaders());
    return {
      url,
      finalUrl: response.finalUrl || url,
      payload: JSON.parse(response.text),
    };
  } catch (error: any) {
    if (Number(error?.httpStatus) !== 403) throw error;
    const fallbackUrl = new URL(buildEndpoint(path));
    if (USDA_FAS_API_KEY) fallbackUrl.searchParams.set("api_key", USDA_FAS_API_KEY);
    const response = await fetchTextResponseWithTimeout(fallbackUrl.toString(), USDA_PSD_TIMEOUT_MS, {
      accept: "application/json,text/plain,*/*",
    });
    return {
      url: fallbackUrl.toString(),
      finalUrl: response.finalUrl || fallbackUrl.toString(),
      payload: JSON.parse(response.text),
    };
  }
}

function getArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.value)) return payload.value;
  return [];
}

function matchCommodityCode(entries: any[], token: string): string | undefined {
  const found = entries.find((row) => {
    const values = [
      row?.commodityCode,
      row?.commodity_code,
      row?.code,
      row?.commodityName,
      row?.commodity_name,
      row?.name,
      row?.description,
    ].map(normalizeToken);
    return values.some((value) => value.includes(normalizeToken(token)));
  });
  return String(found?.commodityCode ?? found?.commodity_code ?? found?.code ?? "").trim() || undefined;
}

function matchAttributeIds(entries: any[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const metric of metricMap) {
    const patterns = [...metric.patterns];
    const found = entries.find((row) => {
      const label = normalizeToken(row?.attributeName ?? row?.attribute_name ?? row?.name ?? row?.description ?? "");
      return patterns.some((pattern: string) => label.includes(pattern));
    });
    const id = String(found?.attributeId ?? found?.attribute_id ?? found?.id ?? "").trim();
    if (id) result[metric.code] = id;
  }
  return result;
}

function normalizeRows(payload: any[], attributeIds: Record<string, string>): GrainWidgetUsdPsdBalanceRow[] {
  const out: GrainWidgetUsdPsdBalanceRow[] = [];
  for (const commodity of commodityMap) {
    for (const metric of metricMap) {
      const patterns = [...metric.patterns];
      const matched = payload
        .filter((row) => {
          const commodityLabel = normalizeToken(row?.commodity ?? row?.commodity_name ?? row?.commodityCode ?? row?.commodity_code ?? "");
          const metricLabel = normalizeToken(row?.attribute ?? row?.attribute_name ?? row?.metric ?? row?.element ?? row?.attributeName ?? "");
          const metricId = String(row?.attributeId ?? row?.attribute_id ?? row?.attributeCode ?? "").trim();
          return (
            commodityLabel.includes(normalizeToken(commodity.code)) &&
            (
              metricLabel.includes(normalizeToken(metric.code)) ||
              patterns.some((pattern: string) => metricLabel.includes(pattern)) ||
              (attributeIds[metric.code] && metricId === attributeIds[metric.code])
            )
          );
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
        series: matched.slice(-LIVE_YEARS_BUDGET).map((row) => ({ ts: row.ts, value: row.value })),
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
    if (!USDA_FAS_API_KEY) {
      throw makeProviderError("usda_fas_api_key_missing", {
        errorKind: "CONFIG_MISSING",
      });
    }
    const now = Date.now();
    if (cacheEntry && now - cacheEntry.fetchedAt <= USDA_PSD_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const commodityMeta = await fetchJson("/psd/commodities");
    const attributeMeta = await fetchJson("/psd/commodityAttributes");
    const commodityCodes = Object.fromEntries(
      commodityMap
        .map((entry) => [entry.code, matchCommodityCode(getArray(commodityMeta.payload), entry.code === "CORN" ? "corn" : entry.code)])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const attributeIds = matchAttributeIds(getArray(attributeMeta.payload));
    const currentYear = new Date().getUTCFullYear();
    const fetchedRows: any[] = [];
    let sourceUrlUsed = commodityMeta.finalUrl;

    for (const commodity of commodityMap) {
      const commodityCode = commodityCodes[commodity.code];
      if (!commodityCode) continue;
      for (let offset = 0; offset < LIVE_YEARS_BUDGET; offset += 1) {
        const marketYear = currentYear - offset;
        const result = await fetchJson(`/psd/commodity/${encodeURIComponent(commodityCode)}/world/year/${marketYear}`);
        sourceUrlUsed = result.finalUrl || result.url;
        fetchedRows.push(...getArray(result.payload));
      }
    }

    const rows = normalizeRows(fetchedRows, attributeIds);
    if (!rows.length) {
      throw makeProviderError("usda_psd_rows_empty", {
        errorKind: "EMPTY",
        finalUrl: sourceUrlUsed,
      });
    }

    const widget: GrainWidgetUsdaPsdBalances = {
      id: "grain-usda-psd-balances",
      kind: "USDA_PSD_BALANCES",
      title: "USDA PSD Balances",
      subtitle: "World supply/demand balance sheet",
      status: rows.length >= 6 ? "REFRESH" : "INDICATIVE",
      sourceName: "USDA FAS OpenData",
      sourceAttribution: "Data: USDA PSD / FAS OpenData",
      sourceUrl: redactSensitiveUrl(sourceUrlUsed),
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
        sourceUrlUsed: redactSensitiveUrl(sourceUrlUsed),
        query: redactSensitiveQuery(sourceUrlUsed.includes("?") ? sourceUrlUsed.split("?")[1] : ""),
        rowsParsed: fetchedRows.length,
        warnings: [`years_requested:${LIVE_YEARS_BUDGET}`],
      },
    };
    cacheEntry = { fetchedAt: now, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
