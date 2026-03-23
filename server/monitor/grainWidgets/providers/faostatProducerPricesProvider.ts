import {
  ENABLE_FAOSTAT_PP_WIDGET,
  FAOSTAT_BASE_URL,
  FAOSTAT_CACHE_TTL_MS,
  FAOSTAT_DATASOURCE,
  FAOSTAT_MAX_YEARS,
  FAOSTAT_TIMEOUT_MS,
} from "../config";
import type {
  GrainWidgetFaostatPpMultiCountry,
  GrainWidgetFaostatPpRow,
  GrainWidgetPoint,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import {
  fetchFaostatDiscovery,
  findAreaCodes,
  findElementCodeProducerPrice,
  findItemCodes,
} from "./faostatDiscovery";
import { fetchTextWithTimeout, parseNumber } from "./utils";

type FaostatObs = {
  areaCode: string;
  areaLabel: string;
  itemCode: string;
  itemLabel: string;
  year: number;
  month?: number;
  value: number;
};

type CacheEntry = {
  fetchedAt: number;
  territory: string;
  widget: GrainWidgetFaostatPpMultiCountry;
};

let cacheEntry: CacheEntry | null = null;

const territoryOptions = [
  { code: "UA", label: "Ukraine" },
  { code: "US", label: "United States" },
  { code: "BR", label: "Brazil" },
  { code: "AR", label: "Argentina" },
  { code: "EU", label: "European Union" },
] as const;

const cropLabelMap: Record<GrainWidgetFaostatPpRow["crop"], string> = {
  WHEAT: "Wheat",
  MAIZE: "Maize (Corn)",
  SOY: "Soybeans",
  RAPESEED: "Rapeseed",
  SUNFLOWER: "Sunflower Seed",
};

function baseUrl(): string {
  return FAOSTAT_BASE_URL.replace(/\/+$/, "");
}

function buildFaostatParams(args: {
  areaCodes: string[];
  itemCodes: string[];
  elementCode: string;
  yearRange: string;
  includeDatasource: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (args.includeDatasource && FAOSTAT_DATASOURCE) {
    params.set("datasource", FAOSTAT_DATASOURCE);
  }
  params.set("area", args.areaCodes.join(","));
  params.set("item", args.itemCodes.join(","));
  params.set("element", args.elementCode);
  params.set("year", args.yearRange);
  params.set("outputType", "json");
  return params;
}

function territoryFromCode(code?: string): { code: string; label: string } {
  const normalized = String(code || "UA").toUpperCase();
  const found = territoryOptions.find((option) => option.code === normalized);
  return found ? { code: found.code, label: found.label } : { code: "UA", label: "Ukraine" };
}

function normalizeObsRows(payload: any): FaostatObs[] {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];
  const out: FaostatObs[] = [];
  for (const row of rows) {
    const areaCode = String(row?.area_code ?? row?.AreaCode ?? row?.area ?? "").trim();
    const areaLabel = String(row?.area ?? row?.Area ?? row?.area_name ?? "").trim();
    const itemCode = String(row?.item_code ?? row?.ItemCode ?? row?.item ?? "").trim();
    const itemLabel = String(row?.item ?? row?.Item ?? row?.item_name ?? "").trim();
    const year = Number.parseInt(String(row?.year ?? row?.Year ?? ""), 10);
    const month = Number.parseInt(String(row?.month ?? row?.Month ?? ""), 10);
    const value = parseNumber(row?.value ?? row?.Value);
    if (!areaCode || !itemCode || !Number.isFinite(year) || value == null) continue;
    out.push({
      areaCode,
      areaLabel,
      itemCode,
      itemLabel,
      year,
      month: Number.isFinite(month) ? month : undefined,
      value,
    });
  }
  return out;
}

function cadenceFromObs(obs: FaostatObs[]): "monthly" | "annual" {
  if (obs.some((row) => typeof row.month === "number" && row.month >= 1 && row.month <= 12)) return "monthly";
  return "annual";
}

function toSeries(obs: FaostatObs[], size: number): GrainWidgetPoint[] {
  return obs
    .map((row) => {
      const month = row.month && row.month >= 1 && row.month <= 12 ? row.month : 1;
      const ts = new Date(Date.UTC(row.year, month - 1, 1)).toISOString();
      return { ts, value: Number(row.value.toFixed(4)) };
    })
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-Math.max(6, size));
}

function buildRow(args: {
  crop: GrainWidgetFaostatPpRow["crop"];
  obs: FaostatObs[];
  unit: string;
  territory: { code: string; label: string };
  seriesPoints: number;
}): GrainWidgetFaostatPpRow | undefined {
  if (!args.obs.length) return undefined;
  const sorted = [...args.obs].sort((a, b) => (a.year * 100 + (a.month || 1)) - (b.year * 100 + (b.month || 1)));
  const latest = sorted[sorted.length - 1];
  if (!latest) return undefined;
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
  const changeAbs = prev ? Number((latest.value - prev.value).toFixed(4)) : undefined;
  const changePct = prev && prev.value !== 0
    ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2))
    : undefined;
  const cadence = cadenceFromObs(sorted);
  const series = toSeries(sorted, args.seriesPoints);
  return {
    crop: args.crop,
    label: cropLabelMap[args.crop],
    current: Number(latest.value.toFixed(4)),
    unit: /usd/i.test(args.unit) ? "USD/t" : /lcu/i.test(args.unit) ? "LCU/t" : args.unit || "price",
    cadence,
    changeAbs,
    changePct,
    series,
    confidence: cadence === "monthly" ? "HIGH" : "MED",
    notes: args.unit.toLowerCase().includes("lcu") ? ["native_currency_unit"] : undefined,
    territory: args.territory,
  };
}

export class FaostatProducerPricesProvider implements GrainWidgetsProvider {
  id = "faostat-pp";
  kind = "FAOSTAT_PP_MULTI_COUNTRY" as const;
  enabled = ENABLE_FAOSTAT_PP_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "FAOSTAT_PP_MULTI_COUNTRY" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetFaostatPpMultiCountry> {
    const territory = territoryFromCode(ctx.country);
    const now = Date.now();
    if (cacheEntry && cacheEntry.territory === territory.code && now - cacheEntry.fetchedAt <= FAOSTAT_CACHE_TTL_MS) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const warnings: string[] = [];
    const discovery = await fetchFaostatDiscovery();
    const area = findAreaCodes({
      areas: discovery.areas,
      territory: territory.code as "UA" | "US" | "BR" | "AR" | "EU",
    });
    const itemCodes = findItemCodes(discovery.items);
    const element = findElementCodeProducerPrice(discovery.elements);

    const requestedCropEntries = Object.entries(itemCodes)
      .filter(([, code]) => !!code) as Array<[GrainWidgetFaostatPpRow["crop"], string]>;

    if (!area.selectedCodes.length) throw new Error(`faostat_area_not_found:${territory.code}`);
    if (!requestedCropEntries.length) throw new Error("faostat_items_not_found");
    if (!element.code) throw new Error("faostat_element_not_found");

    const currentYear = new Date().getUTCFullYear();
    const yearMin = currentYear - Math.max(1, FAOSTAT_MAX_YEARS) + 1;
    const yearRange = Array.from({ length: Math.max(1, FAOSTAT_MAX_YEARS) }, (_, idx) => String(yearMin + idx)).join(",");

    const itemCodeList = requestedCropEntries.map(([, code]) => code);
    const requestVariants = [true, false];
    let parsed: any;
    let sourceUrlUsed = "";
    let lastQueryError: unknown;
    for (const includeDatasource of requestVariants) {
      try {
        const params = buildFaostatParams({
          areaCodes: area.selectedCodes,
          itemCodes: itemCodeList,
          elementCode: element.code,
          yearRange,
          includeDatasource,
        });
        sourceUrlUsed = `${baseUrl()}/data/PP?${params.toString()}`;
        const raw = await fetchTextWithTimeout(sourceUrlUsed, FAOSTAT_TIMEOUT_MS, {
          accept: "application/json,text/plain,*/*",
        });
        parsed = JSON.parse(raw);
        break;
      } catch (error) {
        lastQueryError = error;
      }
    }
    if (!parsed) {
      throw lastQueryError instanceof Error ? lastQueryError : new Error("faostat_query_failed");
    }
    const observations = normalizeObsRows(parsed);

    const rows: GrainWidgetFaostatPpRow[] = [];
    const observationsByCrop: Array<{ crop: string; count: number }> = [];

    for (const [crop, itemCode] of requestedCropEntries) {
      const cropObs = observations.filter((row) => row.itemCode === itemCode);
      observationsByCrop.push({ crop, count: cropObs.length });
      if (!cropObs.length) {
        warnings.push(`missing_crop:${crop}`);
        continue;
      }

      let selectedObs = cropObs;
      if (territory.code === "EU") {
        const byYear = new Map<string, FaostatObs[]>();
        for (const row of cropObs) {
          const key = `${row.year}-${row.month || 1}`;
          if (!byYear.has(key)) byYear.set(key, []);
          byYear.get(key)!.push(row);
        }
        const proxyObs: FaostatObs[] = [];
        for (const [key, entries] of byYear.entries()) {
          const values = entries.map((entry) => entry.value).filter((value) => Number.isFinite(value));
          if (!values.length) continue;
          const sorted = [...values].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          const [yearRaw, monthRaw] = key.split("-");
          const monthParsed = Number.parseInt(monthRaw, 10);
          proxyObs.push({
            areaCode: "EU_PROXY",
            areaLabel: "EU proxy",
            itemCode,
            itemLabel: entries[0]?.itemLabel || crop,
            year: Number.parseInt(yearRaw, 10),
            month: Number.isFinite(monthParsed) ? monthParsed : undefined,
            value: median,
          });
        }
        selectedObs = proxyObs;
      } else {
        selectedObs = cropObs.filter((row) => area.selectedCodes.includes(row.areaCode));
      }

      const built = buildRow({
        crop,
        obs: selectedObs,
        unit: element.unit || element.label || "USD/tonne",
        territory,
        seriesPoints: ctx.seriesPoints,
      });
      if (!built) {
        warnings.push(`unusable_crop:${crop}`);
        continue;
      }
      if (territory.code === "EU") {
        built.notes = [...(built.notes || []), "eu_proxy_median"];
        built.confidence = "MED";
      }
      rows.push(built);
    }

    if (!rows.length) {
      throw new Error(`faostat_rows_empty:${territory.code}`);
    }

    const expectedCount = 5;
    const mappedCount = rows.length;
    const coverage = `${mappedCount}/${expectedCount}`;
    const status = mappedCount >= 4 ? "REFRESH" : "INDICATIVE";
    const cadence = rows.some((row) => row.cadence === "monthly") ? "monthly" : "annual";

    const widget: GrainWidgetFaostatPpMultiCountry = {
      id: "grain-faostat-pp-multi-country",
      kind: "FAOSTAT_PP_MULTI_COUNTRY",
      title: "Regional Producer Prices (FAOSTAT)",
      subtitle: "FAOSTAT PP (producer prices)",
      status,
      sourceName: "FAOSTAT (PP)",
      sourceAttribution: "Data: FAOSTAT Producer Prices",
      sourceUrl: sourceUrlUsed,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_MULTI",
      territory,
      supportedTerritories: territoryOptions.map((option) => ({ code: option.code, label: option.label })),
      territorySelector: {
        paramName: "country",
        default: "UA",
        current: territory.code,
        persistKey: "monitor_country_FAOSTAT_PP_MULTI_COUNTRY",
      },
      rows,
      summary: {
        expectedCount,
        mappedCount,
        coverage,
        cadence,
        selectedTerritory: territory.code,
      },
      notes: [
        "No synthetic fills",
        element.unit && /lcu/i.test(element.unit) ? "LCU units preserved" : "USD/t where available",
      ],
      debug: {
        sourceUrlUsed,
        areaCodes: area.selectedCodes,
        itemCodes: requestedCropEntries.map(([, code]) => code),
        elementCode: element.code,
        elementLabel: element.label,
        observationsByCrop,
        discoveryCacheHit: discovery.cacheHit,
        query: sourceUrlUsed.includes("?") ? sourceUrlUsed.split("?")[1] : "",
        warnings: warnings.length ? warnings : undefined,
      },
    };

    cacheEntry = {
      fetchedAt: now,
      territory: territory.code,
      widget,
    };

    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetFaostatPpMultiCountry {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetFaostatPpMultiCountry;
  }
}
