import {
  ENABLE_FPMA_MARKET_PRICES_WIDGET,
  FPMA_API_BASE_URL,
  FPMA_CACHE_TTL_MS,
  FPMA_CROP_MAP,
  FPMA_DATA_PATHS,
  FPMA_DEFAULT_PRICE_TYPE,
  FPMA_EU_PROXY_COUNTRIES,
  FPMA_MAX_POINTS,
  FPMA_SUPPORTED_PRICE_TYPES,
  FPMA_TIMEOUT_MS,
} from "../config";
import type {
  GrainWidgetFpmaMarketPricesMultiCountry,
  GrainWidgetFpmaMarketPricesRow,
  GrainWidgetPoint,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, parseNumber } from "./utils";

type TerritoryCode = "UA" | "US" | "BR" | "AR" | "EU";
type PriceType = "RETAIL" | "WHOLESALE";
type CropKey = GrainWidgetFpmaMarketPricesRow["crop"];

type NormalizedObs = {
  countryCode: string;
  countryLabel: string;
  crop: CropKey;
  commodityId?: string;
  commodityLabel: string;
  priceType?: PriceType;
  unit: string;
  currency?: string;
  date: string;
  value: number;
};

type CropSeries = {
  key: string;
  countryCode: string;
  crop: CropKey;
  commodityId?: string;
  commodityLabel: string;
  priceType?: PriceType;
  unit: string;
  currency?: string;
  points: GrainWidgetPoint[];
};

type CacheEntry = {
  fetchedAt: number;
  territory: TerritoryCode;
  priceType: PriceType;
  widget: GrainWidgetFpmaMarketPricesMultiCountry;
};

let cacheEntry: CacheEntry | null = null;

const territoryOptions = [
  { code: "UA", label: "Ukraine" },
  { code: "US", label: "United States" },
  { code: "BR", label: "Brazil" },
  { code: "AR", label: "Argentina" },
  { code: "EU", label: "European Union" },
] as const;

const iso3to2: Record<string, string> = {
  UKR: "UA",
  USA: "US",
  BRA: "BR",
  ARG: "AR",
  FRA: "FR",
  DEU: "DE",
  POL: "PL",
  ROU: "RO",
  ESP: "ES",
};

const countryNameToCode: Array<{ needle: RegExp; code: string }> = [
  { needle: /ukraine/i, code: "UA" },
  { needle: /united\s+states|usa|u\.s\./i, code: "US" },
  { needle: /brazil/i, code: "BR" },
  { needle: /argentina/i, code: "AR" },
  { needle: /france/i, code: "FR" },
  { needle: /germany/i, code: "DE" },
  { needle: /poland/i, code: "PL" },
  { needle: /romania/i, code: "RO" },
  { needle: /spain/i, code: "ES" },
];

const cropLabels: Record<CropKey, string> = {
  WHEAT: "Wheat (domestic)",
  MAIZE: "Maize (Corn) (domestic)",
  SOY: "Soybeans (domestic)",
  RAPESEED: "Rapeseed (domestic)",
  SUNFLOWER: "Sunflower (domestic)",
};

function territoryFromCode(code?: string): { code: TerritoryCode; label: string } {
  const normalized = String(code || "UA").toUpperCase();
  const found = territoryOptions.find((entry) => entry.code === normalized);
  if (found) return { code: found.code, label: found.label };
  return { code: "UA", label: "Ukraine" };
}

function selectedPriceType(raw?: string): PriceType {
  const normalized = String(raw || FPMA_DEFAULT_PRICE_TYPE).toUpperCase();
  return normalized === "RETAIL" ? "RETAIL" : "WHOLESALE";
}

function parseCropMap(): Record<CropKey, string[]> {
  try {
    const parsed = JSON.parse(FPMA_CROP_MAP || "{}");
    return {
      WHEAT: Array.isArray(parsed?.WHEAT) ? parsed.WHEAT.map((v: string) => String(v).toLowerCase()) : ["wheat"],
      MAIZE: Array.isArray(parsed?.MAIZE) ? parsed.MAIZE.map((v: string) => String(v).toLowerCase()) : ["maize", "corn"],
      SOY: Array.isArray(parsed?.SOY) ? parsed.SOY.map((v: string) => String(v).toLowerCase()) : ["soy", "soybean"],
      RAPESEED: Array.isArray(parsed?.RAPESEED) ? parsed.RAPESEED.map((v: string) => String(v).toLowerCase()) : ["rapeseed", "canola"],
      SUNFLOWER: Array.isArray(parsed?.SUNFLOWER) ? parsed.SUNFLOWER.map((v: string) => String(v).toLowerCase()) : ["sunflower"],
    };
  } catch {
    return {
      WHEAT: ["wheat"],
      MAIZE: ["maize", "corn"],
      SOY: ["soy", "soybean"],
      RAPESEED: ["rapeseed", "canola"],
      SUNFLOWER: ["sunflower"],
    };
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCountryCode(value: unknown): string | undefined {
  const raw = normalizeWhitespace(String(value || "")).toUpperCase();
  if (!raw) return undefined;
  if (raw.length === 2) return raw;
  if (raw.length === 3 && iso3to2[raw]) return iso3to2[raw];
  const match = countryNameToCode.find((entry) => entry.needle.test(raw));
  return match?.code;
}

function normalizePriceType(value: unknown): PriceType | undefined {
  const raw = String(value || "").toLowerCase();
  if (!raw) return undefined;
  if (raw.includes("retail")) return "RETAIL";
  if (raw.includes("wholesale")) return "WHOLESALE";
  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01T00:00:00.000Z`;
  const compact = raw.match(/^(\d{4})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-01T00:00:00.000Z`;
  return undefined;
}

function cadenceFromSeries(points: GrainWidgetPoint[]): GrainWidgetFpmaMarketPricesRow["cadence"] {
  if (points.length < 3) return "unknown";
  const ts = points
    .map((point) => Date.parse(point.ts))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (ts.length < 3) return "unknown";
  const diffs: number[] = [];
  for (let i = 1; i < ts.length; i += 1) {
    const days = Math.round((ts[i] - ts[i - 1]) / 86_400_000);
    if (days > 0) diffs.push(days);
  }
  if (!diffs.length) return "unknown";
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 10) return "weekly";
  if (median <= 40) return "monthly";
  if (median <= 420) return "annual";
  return "unknown";
}

function parsePayloadRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const keys = ["data", "results", "items", "records", "response", "series"];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === "object") {
      const nested = parsePayloadRows(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function mapCrop(label: string, cropMap: Record<CropKey, string[]>): CropKey | undefined {
  const normalized = String(label || "").toLowerCase();
  if (!normalized) return undefined;
  const entries = Object.entries(cropMap) as Array<[CropKey, string[]]>;
  for (const [crop, aliases] of entries) {
    if (aliases.some((alias) => normalized.includes(alias))) return crop;
  }
  return undefined;
}

function extractObservations(rows: any[], cropMap: Record<CropKey, string[]>): NormalizedObs[] {
  const out: NormalizedObs[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const cropRaw =
      row.commodity ||
      row.commodity_name ||
      row.item ||
      row.item_name ||
      row.product ||
      row.product_name ||
      row.cm_name ||
      row.name;

    const crop = mapCrop(String(cropRaw || ""), cropMap);
    if (!crop) continue;

    const value = parseNumber(row.value ?? row.price ?? row.v ?? row.avg_price ?? row.median_price);
    if (value == null) continue;

    const date = normalizeDate(
      row.date ||
      row.month ||
      row.period ||
      row.time ||
      row.yearMonth ||
      row.reference_period,
    );
    if (!date) continue;

    const countryCode = normalizeCountryCode(
      row.countryCode ||
      row.country_code ||
      row.iso3 ||
      row.iso_code ||
      row.adm0_code ||
      row.country ||
      row.country_name ||
      row.area,
    );
    if (!countryCode) continue;

    const countryLabel = normalizeWhitespace(
      String(row.country || row.country_name || row.area || row.adm0_name || countryCode),
    );

    const unit = normalizeWhitespace(
      String(row.unit || row.unit_name || row.um_name || row.measurement_unit || "value"),
    );

    const currency = normalizeWhitespace(
      String(row.currency || row.currency_code || row.cur || ""),
    ) || undefined;

    const priceType = normalizePriceType(
      row.priceType ||
      row.price_type ||
      row.pt_name ||
      row.market_type ||
      row.category,
    );

    const commodityIdRaw = row.commodity_id || row.item_code || row.cm_id || row.product_id;
    const commodityId = commodityIdRaw != null ? String(commodityIdRaw) : undefined;

    out.push({
      countryCode,
      countryLabel,
      crop,
      commodityId,
      commodityLabel: normalizeWhitespace(String(cropRaw || cropLabels[crop])),
      priceType,
      unit,
      currency,
      date,
      value: Number(value.toFixed(6)),
    });
  }

  return out;
}

function groupObservations(observations: NormalizedObs[], pointsMax: number): CropSeries[] {
  const grouped = new Map<string, NormalizedObs[]>();
  for (const obs of observations) {
    const key = [obs.countryCode, obs.crop, obs.priceType || "ANY", obs.unit, obs.currency || "NA"].join("|");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(obs);
  }

  const series: CropSeries[] = [];
  for (const [key, values] of grouped.entries()) {
    const sorted = values
      .map((entry) => ({ ts: entry.date, value: Number(entry.value.toFixed(4)) }))
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (!sorted.length) continue;
    const sample = values[0];
    series.push({
      key,
      countryCode: sample.countryCode,
      crop: sample.crop,
      commodityId: sample.commodityId,
      commodityLabel: sample.commodityLabel,
      priceType: sample.priceType,
      unit: sample.unit,
      currency: sample.currency,
      points: sorted.slice(-Math.max(6, pointsMax)),
    });
  }
  return series;
}

function median(values: number[]): number | undefined {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return undefined;
  const sorted = [...finite].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function aggregateEuSeries(groups: CropSeries[]): CropSeries | undefined {
  if (!groups.length) return undefined;
  const unitCounts = new Map<string, number>();
  for (const group of groups) {
    unitCounts.set(group.unit, (unitCounts.get(group.unit) || 0) + 1);
  }
  const dominantUnit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const compatible = groups.filter((group) => group.unit === dominantUnit);
  if (!compatible.length) return undefined;

  const byTs = new Map<string, number[]>();
  for (const group of compatible) {
    for (const point of group.points) {
      if (!byTs.has(point.ts)) byTs.set(point.ts, []);
      byTs.get(point.ts)!.push(point.value);
    }
  }

  const points: GrainWidgetPoint[] = [];
  for (const [ts, values] of byTs.entries()) {
    const v = median(values);
    if (v == null) continue;
    points.push({ ts, value: Number(v.toFixed(4)) });
  }

  points.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (!points.length) return undefined;

  const sample = compatible[0];
  return {
    key: `EU|${sample.crop}|${sample.priceType || "ANY"}|${sample.unit}`,
    countryCode: "EU",
    crop: sample.crop,
    commodityId: sample.commodityId,
    commodityLabel: sample.commodityLabel,
    priceType: sample.priceType,
    unit: sample.unit,
    currency: sample.currency,
    points,
  };
}

function selectCodes(territory: TerritoryCode): string[] {
  if (territory === "EU") {
    return FPMA_EU_PROXY_COUNTRIES.length ? FPMA_EU_PROXY_COUNTRIES : ["FR", "DE", "PL", "RO", "ES"];
  }
  return [territory];
}

function buildCandidateUrls(args: { base: string; path: string; territory: TerritoryCode; priceType: PriceType }): string[] {
  const root = `${args.base.replace(/\/+$/, "")}/${args.path.replace(/^\/+/, "")}`;
  const candidates = [
    `${root}?format=json`,
    `${root}?outputType=json`,
    `${root}?format=json&country=${encodeURIComponent(args.territory)}`,
    `${root}?format=json&adm0_code=${encodeURIComponent(args.territory)}`,
    `${root}?format=json&country=${encodeURIComponent(args.territory)}&priceType=${encodeURIComponent(args.priceType.toLowerCase())}`,
    `${root}?format=json&country=${encodeURIComponent(args.territory)}&price_type=${encodeURIComponent(args.priceType.toLowerCase())}`,
  ];
  return Array.from(new Set(candidates));
}

function toFpmaRow(args: {
  series: CropSeries;
  territory: { code: TerritoryCode; label: string };
  confidence: GrainWidgetFpmaMarketPricesRow["confidence"];
  notes?: string[];
}): GrainWidgetFpmaMarketPricesRow | undefined {
  const points = args.series.points;
  const latest = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : undefined;
  if (!latest) return undefined;
  const changeAbs = prev ? Number((latest.value - prev.value).toFixed(4)) : undefined;
  const changePct = prev && prev.value !== 0
    ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2))
    : undefined;

  return {
    crop: args.series.crop,
    label: cropLabels[args.series.crop],
    current: Number(latest.value.toFixed(4)),
    unit: args.series.unit,
    currency: args.series.currency,
    cadence: cadenceFromSeries(points),
    changeAbs,
    changePct,
    series: points,
    confidence: args.confidence,
    notes: args.notes,
    territory: { code: args.territory.code, label: args.territory.label },
  };
}

export class FpmaMarketPricesProvider implements GrainWidgetsProvider {
  id = "fpma-market-prices";
  kind = "FPMA_MARKET_PRICES_MULTI_COUNTRY" as const;
  enabled = ENABLE_FPMA_MARKET_PRICES_WIDGET;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "FPMA_MARKET_PRICES_MULTI_COUNTRY" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetFpmaMarketPricesMultiCountry> {
    const territory = territoryFromCode(ctx.country);
    const selectedType = selectedPriceType(ctx.priceType);
    const now = Date.now();
    if (
      cacheEntry &&
      cacheEntry.territory === territory.code &&
      cacheEntry.priceType === selectedType &&
      now - cacheEntry.fetchedAt <= FPMA_CACHE_TTL_MS
    ) {
      return {
        ...cacheEntry.widget,
        updatedAt: ctx.now.toISOString(),
        notes: [...(cacheEntry.widget.notes || []), "cache_hit"],
      };
    }

    const cropMap = parseCropMap();
    const warnings: string[] = [];
    const parseResults: NormalizedObs[] = [];
    let sourceUrlUsed: string | undefined;

    const allUrls: string[] = [];
    for (const path of FPMA_DATA_PATHS) {
      allUrls.push(...buildCandidateUrls({ base: FPMA_API_BASE_URL, path, territory: territory.code, priceType: selectedType }));
    }

    for (const url of allUrls) {
      try {
        const raw = await fetchTextWithTimeout(url, FPMA_TIMEOUT_MS, {
          accept: "application/json,text/plain,*/*",
        });
        const parsed = JSON.parse(raw);
        const rows = parsePayloadRows(parsed);
        if (!rows.length) {
          warnings.push(`empty_payload:${url}`);
          continue;
        }
        const observations = extractObservations(rows, cropMap);
        if (!observations.length) {
          warnings.push(`no_mappable_rows:${url}`);
          continue;
        }
        parseResults.push(...observations);
        sourceUrlUsed = sourceUrlUsed || url;
        if (parseResults.length >= 50) break;
      } catch (error: any) {
        warnings.push(`${url}:${String(error?.message || "fetch_failed").slice(0, 90)}`);
      }
    }

    if (!sourceUrlUsed && warnings.length) {
      throw new Error(warnings[0] || "fpma_fetch_failed");
    }

    const grouped = groupObservations(parseResults, Math.min(24, Math.max(6, FPMA_MAX_POINTS, ctx.seriesPoints)));
    const selectedCountryCodes = selectCodes(territory.code);
    const rows: GrainWidgetFpmaMarketPricesRow[] = [];
    const commodityIdsUsed = new Set<string>();
    const availablePriceTypes = new Set<PriceType>();

    for (const crop of ["WHEAT", "MAIZE", "SOY", "RAPESEED", "SUNFLOWER"] as const) {
      const cropGroups = grouped.filter((group) => group.crop === crop && selectedCountryCodes.includes(group.countryCode));
      const byType = cropGroups.filter((group) => group.priceType === selectedType);
      const candidates = byType.length ? byType : cropGroups;
      for (const group of candidates) {
        if (group.priceType) availablePriceTypes.add(group.priceType);
      }
      if (!candidates.length) continue;

      const built = territory.code === "EU"
        ? toFpmaRow({
            series: aggregateEuSeries(candidates) || candidates.sort((a, b) => b.points.length - a.points.length)[0],
            territory,
            confidence: "MED",
            notes: [
              "eu_proxy",
              byType.length ? "price_type_match" : `price_type_fallback:${selectedType.toLowerCase()}`,
            ],
          })
        : toFpmaRow({
            series: candidates.sort((a, b) => b.points.length - a.points.length)[0],
            territory,
            confidence: byType.length ? "HIGH" : "MED",
            notes: byType.length ? undefined : [`price_type_fallback:${selectedType.toLowerCase()}`],
          });

      if (!built) continue;
      const picked = candidates.sort((a, b) => b.points.length - a.points.length)[0];
      if (picked?.commodityId) commodityIdsUsed.add(picked.commodityId);
      rows.push(built);
    }

    const expectedCount = 5;
    const mappedCount = rows.length;
    const coverage = `${mappedCount}/${expectedCount}`;
    const cadence = rows.some((row) => row.cadence === "monthly")
      ? "monthly"
      : rows.some((row) => row.cadence === "weekly")
        ? "weekly"
        : rows.some((row) => row.cadence === "annual")
          ? "annual"
          : "unknown";

    const widget: GrainWidgetFpmaMarketPricesMultiCountry = {
      id: "grain-fpma-market-prices-multi-country",
      kind: "FPMA_MARKET_PRICES_MULTI_COUNTRY",
      title: "Domestic Market Prices (FPMA)",
      subtitle: "FAO FPMA (wholesale/retail)",
      status: mappedCount >= 4 ? "REFRESH" : "INDICATIVE",
      sourceName: "FAO FPMA (GIEWS)",
      sourceAttribution: "Data: FAO FPMA domestic market prices",
      sourceUrl: sourceUrlUsed || FPMA_API_BASE_URL,
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      territoryScope: "COUNTRY_MULTI",
      territory,
      supportedTerritories: territoryOptions.map((entry) => ({ code: entry.code, label: entry.label })),
      territorySelector: {
        paramName: "country",
        default: "UA",
        current: territory.code,
        persistKey: "monitor_country_FPMA_MARKET_PRICES_MULTI_COUNTRY",
      },
      selector: {
        priceType: {
          current: selectedType,
          options: Array.from(new Set<PriceType>([...FPMA_SUPPORTED_PRICE_TYPES, ...availablePriceTypes])),
        },
      },
      rows,
      summary: {
        expectedCount,
        mappedCount,
        coverage,
        cadence,
        selectedTerritory: territory.code,
        selectedPriceType: selectedType,
      },
      notes: mappedCount
        ? ["Native units preserved (no forced USD/t conversion)", "FPMA coverage varies by country and crop"]
        : ["no_data_for_country"],
      debug: {
        sourceUrlUsed: sourceUrlUsed || FPMA_API_BASE_URL,
        countryQueryUsed: territory.code,
        commodityIdsUsed: Array.from(commodityIdsUsed),
        rowsParsed: parseResults.length,
        query: sourceUrlUsed ? new URL(sourceUrlUsed).search : undefined,
        warnings: warnings.length ? warnings : undefined,
      },
    };

    cacheEntry = {
      fetchedAt: now,
      territory: territory.code,
      priceType: selectedType,
      widget,
    };

    return widget;
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetFpmaMarketPricesMultiCountry {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetFpmaMarketPricesMultiCountry;
  }
}
