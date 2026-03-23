import {
  ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET,
  EUROSTAT_AGRI_DATASETS,
  EUROSTAT_BASE_URL,
  EUROSTAT_CACHE_TTL_MS,
  EUROSTAT_MEMBER_STATES,
  EUROSTAT_TIMEOUT_MS,
} from "../config";
import type {
  GrainWidgetEurostatAgriPriceIndexItem,
  GrainWidgetEurostatAgriPriceIndices,
  GrainWidgetPoint,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextResponseWithTimeout, parseNumber } from "./utils";

type TerritoryCode = "FR" | "DE" | "PL" | "RO" | "ES" | "EU";
type CacheEntry = { fetchedAt: number; territory: TerritoryCode; widget: GrainWidgetEurostatAgriPriceIndices };

let cacheEntry: CacheEntry | null = null;

const territoryLabels: Record<TerritoryCode, string> = {
  FR: "France",
  DE: "Germany",
  PL: "Poland",
  RO: "Romania",
  ES: "Spain",
  EU: "European Union",
};

function territoryFromCountry(raw?: string): { code: TerritoryCode; label: string } {
  const code = String(raw || "FR").toUpperCase() as TerritoryCode;
  if (code in territoryLabels) return { code, label: territoryLabels[code] };
  return { code: "FR", label: territoryLabels.FR };
}

function flattenJsonStatSeries(payload: any): Array<{ key: string; label: string; values: GrainWidgetPoint[] }> {
  const valueMap = payload?.value;
  const id: string[] = Array.isArray(payload?.id) ? payload.id : [];
  const size: number[] = Array.isArray(payload?.size) ? payload.size : [];
  const dimension = payload?.dimension || {};
  if (!valueMap || !id.length || !size.length) return [];

  const categories = id.map((dimensionId: string) => {
    const category = dimension?.[dimensionId]?.category;
    const indexes = category?.index || {};
    const labels = category?.label || {};
    const ordered = Object.entries(indexes)
      .map(([code, index]) => ({ code, index: Number(index), label: String(labels?.[code] || code) }))
      .sort((a, b) => a.index - b.index);
    return { dimensionId, ordered };
  });

  const timeIdx = id.findIndex((entry) => entry === "time");
  const timeCategories = timeIdx >= 0 ? categories[timeIdx].ordered : [];
  const dimsWithoutTime = categories.filter((_, index) => index !== timeIdx);
  const nonTimeSizes = size.filter((_, index) => index !== timeIdx);

  const totalSeries = nonTimeSizes.reduce((acc, value) => acc * value, 1) || 1;
  const timeSize = timeCategories.length || 1;
  const out: Array<{ key: string; label: string; values: GrainWidgetPoint[] }> = [];

  for (let seriesIndex = 0; seriesIndex < totalSeries; seriesIndex += 1) {
    let cursor = seriesIndex;
    const labels: string[] = [];
    for (let i = dimsWithoutTime.length - 1; i >= 0; i -= 1) {
      const dimSize = nonTimeSizes[i];
      const selected = cursor % dimSize;
      cursor = Math.floor(cursor / dimSize);
      labels.unshift(dimsWithoutTime[i].ordered[selected]?.label || dimsWithoutTime[i].ordered[selected]?.code || "");
    }
    const points: GrainWidgetPoint[] = [];
    for (let t = 0; t < timeSize; t += 1) {
      const flatIndex = seriesIndex * timeSize + t;
      const rawValue = valueMap[String(flatIndex)] ?? valueMap[flatIndex];
      const value = parseNumber(rawValue);
      const timeCode = timeCategories[t]?.code || "";
      if (value == null || !timeCode) continue;
      const ts = /^\d{4}-Q\d$/.test(timeCode)
        ? `${timeCode.slice(0, 4)}-${String((Number(timeCode.slice(-1)) - 1) * 3 + 1).padStart(2, "0")}-01T00:00:00.000Z`
        : /^\d{4}$/.test(timeCode)
          ? `${timeCode}-01-01T00:00:00.000Z`
          : new Date(Date.parse(timeCode)).toISOString();
      points.push({ ts, value });
    }
    if (points.length) {
      out.push({
        key: labels.join(" | "),
        label: labels.join(" • "),
        values: points.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)),
      });
    }
  }
  return out;
}

function selectSeries(series: Array<{ key: string; label: string; values: GrainWidgetPoint[] }>): GrainWidgetEurostatAgriPriceIndexItem[] {
  const wanted = [
    { id: "agri-output", label: "Agricultural output", match: /agricultural output|output of the agricultural industry/i },
    { id: "cereals", label: "Cereals", match: /cereals/i },
    { id: "industrial-crops", label: "Industrial crops / oilseeds", match: /industrial crops|oilseeds|oleaginous/i },
  ];

  return wanted.flatMap((target) => {
    const found = series.find((entry) => target.match.test(entry.label));
    if (!found) return [];
    const latest = found.values[found.values.length - 1];
    const previous = found.values[found.values.length - 2];
    const cadence = found.values.some((point) => /-\d{2}-01T00:00:00.000Z$/.test(point.ts) && [0, 3, 6, 9].includes(new Date(point.ts).getUTCMonth())) ? "quarterly" : "annual";
    return [{
      id: target.id,
      indexName: target.label,
      current: latest?.value || 0,
      unit: "index pts",
      cadence,
      changeAbs: latest && previous ? Number((latest.value - previous.value).toFixed(4)) : undefined,
      changePct: latest && previous && previous.value !== 0 ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(2)) : undefined,
      series: found.values.slice(-8),
      confidence: found.values.length >= 4 ? "HIGH" : "MED",
      notes: [`source_label:${found.label}`],
    } satisfies GrainWidgetEurostatAgriPriceIndexItem];
  });
}

export class EurostatAgriIndicesProvider implements GrainWidgetsProvider {
  id = "eurostat-agri-indices";
  kind = "EUROSTAT_AGRI_PRICE_INDICES" as const;
  enabled = ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "EUROSTAT_AGRI_PRICE_INDICES" as any });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetEurostatAgriPriceIndices> {
    const territory = territoryFromCountry(ctx.country);
    const now = Date.now();
    if (cacheEntry && cacheEntry.territory === territory.code && now - cacheEntry.fetchedAt <= EUROSTAT_CACHE_TTL_MS) {
      return { ...cacheEntry.widget, updatedAt: ctx.now.toISOString(), notes: [...(cacheEntry.widget.notes || []), "cache_hit"] };
    }

    const warnings: string[] = [];
    const collected: GrainWidgetEurostatAgriPriceIndexItem[] = [];
    let sourceUrlUsed = "";
    for (const dataset of EUROSTAT_AGRI_DATASETS) {
      const url = new URL(`${EUROSTAT_BASE_URL}/${dataset}`);
      url.searchParams.set("geo", territory.code === "EU" ? "EU27_2020" : territory.code);
      url.searchParams.set("lang", "en");
      url.searchParams.set("format", "JSON");
      const response = await fetchTextResponseWithTimeout(url.toString(), EUROSTAT_TIMEOUT_MS, {
        accept: "application/json,text/plain,*/*",
      });
      sourceUrlUsed = url.toString();
      const parsed = JSON.parse(response.text);
      const series = flattenJsonStatSeries(parsed);
      const picked = selectSeries(series);
      if (picked.length) {
        collected.push(...picked);
      } else {
        warnings.push(`dataset_empty:${dataset}`);
      }
    }
    const deduped = collected.filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);
    if (!deduped.length) throw new Error(`eurostat_indices_empty:${territory.code}`);

    const widget: GrainWidgetEurostatAgriPriceIndices = {
      id: "grain-eurostat-agri-price-indices",
      kind: "EUROSTAT_AGRI_PRICE_INDICES",
      title: "Eurostat Agri Price Indices",
      subtitle: "EU agricultural price index layer",
      status: deduped.length >= 2 ? "REFRESH" : "INDICATIVE",
      sourceName: "Eurostat",
      sourceAttribution: "Data: Eurostat agricultural price indices",
      sourceUrl: sourceUrlUsed,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_MULTI",
      territory: { code: territory.code, label: territory.label },
      supportedTerritories: EUROSTAT_MEMBER_STATES.map((code) => ({ code, label: territoryLabels[code as TerritoryCode] || code })),
      territorySelector: {
        paramName: "country",
        default: EUROSTAT_MEMBER_STATES[0] || "FR",
        current: territory.code,
        persistKey: "monitor_country_EUROSTAT_AGRI_PRICE_INDICES",
      },
      items: deduped,
      summary: {
        expectedCount: 3,
        mappedCount: deduped.length,
        coverage: `${deduped.length}/3`,
        cadence: deduped.some((item) => item.cadence === "quarterly") ? "quarterly" : "annual",
        selectedTerritory: territory.code,
      },
      notes: ["Index points preserved; no USD/t normalization"],
      debug: {
        sourceUrlUsed,
        query: sourceUrlUsed.includes("?") ? sourceUrlUsed.split("?")[1] : "",
        rowsParsed: deduped.reduce((sum, item) => sum + (item.series?.length || 0), 0),
        warnings: warnings.length ? warnings : undefined,
      },
    };
    cacheEntry = { fetchedAt: now, territory: territory.code, widget };
    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext) {
    return this.fallback.mockFallback(reason, ctx) as any;
  }
}
