import { fetchTextWithTimeout } from "./grainWidgets/providers/utils";

const GEOGLAM_ARCHIVE_URL = process.env.GEOGLAM_ARCHIVE_URL || "https://www.cropmonitor.org/data-archive/";
const GEOGLAM_ARCGIS_ITEMS_BASE_URL =
  process.env.GEOGLAM_ARCGIS_ITEMS_BASE_URL || "https://uofmd.maps.arcgis.com/sharing/rest/content/items";
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_YIELD_FS_FETCH_TIMEOUT_MS || "7000", 10);
const CACHE_TTL_MS = Number.parseInt(process.env.MONITOR_YIELD_FS_CACHE_TTL_MS || String(15 * 60 * 1000), 10);
const GEOGLAM_MAX_ITEM_DETAILS = Number.parseInt(process.env.MONITOR_YIELD_GEOGLAM_MAX_ITEMS || "18", 10);

export type YieldCrop = "ALL" | "WHEAT" | "MAIZE" | "RICE" | "SOYBEAN" | "SORGHUM" | "MILLET" | "SYNTHESIS";
type YieldStatus = "REFRESH" | "INDICATIVE" | "CONSTRAINED";

type GrainWidgetsByKind = Record<string, any>;

type GeoglamDataset = {
  id: string;
  title: string;
  crop: YieldCrop;
  sourceUrl: string;
  thumbnailUrl?: string;
  updatedAt?: string;
  countryRelevant: boolean;
  tags: string[];
  snippet?: string;
};

type YieldFoodSecurityPayload = {
  generatedAt: string;
  cacheHit: boolean;
  country: string;
  crop: YieldCrop;
  geoglam: {
    status: YieldStatus;
    source: string;
    archiveUrl: string;
    selectedCount: number;
    latestUpdate?: string;
    note: string;
    datasets: GeoglamDataset[];
  };
  foodPrices: {
    status: YieldStatus;
    source: string;
    faoRows: Array<{
      label: string;
      value: string;
      deltaPct?: number;
      series: number[];
    }>;
  };
  foodSecurity: {
    status: YieldStatus;
    source: string;
    score: number | null;
    localDeviation: number | null;
    globalDeviation: number | null;
    localScore: number | null;
    globalScore: number | null;
    marketRows: Array<{
      source: "WFP" | "WB";
      crop: string;
      label: string;
      value: string;
      changePct?: number;
      current?: number;
      unit?: string;
      currency?: string;
    }>;
    note: string;
  };
};

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  US: ["united states", "u.s.", "usa", "midwest", "us "],
  UA: ["ukraine", "ukrainian", "kyiv", "odesa", "odessa", "black sea"],
  BR: ["brazil", "brazilian", "parana", "mato grosso", "sao paulo"],
  AR: ["argentina", "argentine", "buenos aires", "rosario"],
  FR: ["france", "french", "paris"],
  DE: ["germany", "german", "berlin", "hamburg"],
  RO: ["romania", "romanian", "bucharest", "constanta"],
};

const YIELD_CROP_KEYWORDS: Record<Exclude<YieldCrop, "ALL">, string[]> = {
  WHEAT: ["wheat"],
  MAIZE: ["maize", "corn"],
  RICE: ["rice"],
  SOYBEAN: ["soybean", "soy"],
  SORGHUM: ["sorghum"],
  MILLET: ["millet"],
  SYNTHESIS: ["synthesis", "overview", "global crop monitor"],
};

let cache = new Map<string, { tsMs: number; payload: YieldFoodSecurityPayload }>();

function parseNum(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function inferCropFromText(text: string): YieldCrop {
  const lc = text.toLowerCase();
  for (const [crop, hints] of Object.entries(YIELD_CROP_KEYWORDS) as Array<[Exclude<YieldCrop, "ALL">, string[]]>) {
    if (hints.some((hint) => lc.includes(hint))) return crop;
  }
  return "SYNTHESIS";
}

function countryRelevant(country: string, text: string): boolean {
  const hints = COUNTRY_KEYWORDS[country] || [];
  if (!hints.length) return false;
  const lc = text.toLowerCase();
  return hints.some((hint) => lc.includes(hint));
}

function normalizeYieldCrop(value?: string): YieldCrop {
  const normalized = String(value || "ALL").toUpperCase();
  if (normalized === "ALL") return "ALL";
  if (normalized === "WHEAT") return "WHEAT";
  if (normalized === "MAIZE" || normalized === "CORN") return "MAIZE";
  if (normalized === "RICE") return "RICE";
  if (normalized === "SOYBEAN" || normalized === "SOY" || normalized === "SOYBEANS") return "SOYBEAN";
  if (normalized === "SORGHUM") return "SORGHUM";
  if (normalized === "MILLET") return "MILLET";
  if (normalized === "SYNTHESIS" || normalized === "OVERVIEW") return "SYNTHESIS";
  return "ALL";
}

function collectArcGisItemIds(html: string): string[] {
  const ids = new Set<string>();
  const regex = /item\.html\?id=([a-f0-9]{8,64})/gi;
  let match: RegExpExecArray | null = regex.exec(html);
  while (match) {
    ids.add(match[1].trim());
    match = regex.exec(html);
  }
  return [...ids];
}

async function fetchGeoglamDatasets(country: string, crop: YieldCrop): Promise<YieldFoodSecurityPayload["geoglam"]> {
  try {
    const archiveHtml = await fetchTextWithTimeout(GEOGLAM_ARCHIVE_URL, FETCH_TIMEOUT_MS);
    const ids = collectArcGisItemIds(archiveHtml).slice(0, Math.max(6, GEOGLAM_MAX_ITEM_DETAILS));
    if (!ids.length) {
      return {
        status: "CONSTRAINED",
        source: "GEOGLAM Crop Monitor",
        archiveUrl: GEOGLAM_ARCHIVE_URL,
        selectedCount: 0,
        note: "No ArcGIS dataset links found on GEOGLAM archive page",
        datasets: [],
      };
    }

    const settled = await Promise.allSettled(
      ids.map(async (id) => {
        const url = `${GEOGLAM_ARCGIS_ITEMS_BASE_URL}/${encodeURIComponent(id)}?f=json`;
        const text = await fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
        const payload = JSON.parse(text);
        const title = String(payload?.title || `Dataset ${id}`);
        const snippet = String(payload?.snippet || payload?.description || "");
        const tags = Array.isArray(payload?.tags) ? payload.tags.map((tag: unknown) => String(tag)) : [];
        const textBlob = [title, snippet, tags.join(" ")].join(" ");
        const inferred = inferCropFromText(textBlob);
        return {
          id,
          title,
          crop: inferred,
          sourceUrl: `https://uofmd.maps.arcgis.com/home/item.html?id=${id}`,
          thumbnailUrl:
            typeof payload?.thumbnail === "string" && payload.thumbnail
              ? `${GEOGLAM_ARCGIS_ITEMS_BASE_URL}/${id}/info/${payload.thumbnail}`
              : undefined,
          updatedAt: typeof payload?.modified === "number" ? new Date(payload.modified).toISOString() : undefined,
          countryRelevant: countryRelevant(country, textBlob),
          tags,
          snippet,
        } as GeoglamDataset;
      }),
    );

    const datasets = settled
      .filter((row): row is PromiseFulfilledResult<GeoglamDataset> => row.status === "fulfilled")
      .map((row) => row.value)
      .filter((row) => crop === "ALL" || row.crop === crop)
      .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));

    const latestUpdate = datasets[0]?.updatedAt;
    const failedCount = settled.filter((row) => row.status === "rejected").length;
    const status: YieldStatus =
      datasets.length > 0 ? "REFRESH" : failedCount < settled.length ? "INDICATIVE" : "CONSTRAINED";

    return {
      status,
      source: "GEOGLAM Crop Monitor (ArcGIS public archive)",
      archiveUrl: GEOGLAM_ARCHIVE_URL,
      selectedCount: datasets.length,
      latestUpdate,
      note:
        status === "REFRESH"
          ? `ArcGIS datasets parsed: ${datasets.length}${failedCount ? ` (${failedCount} detail fetch failures)` : ""}`
          : "GEOGLAM public archive resolved but no matching datasets for current crop/country filter",
      datasets: datasets.slice(0, 12),
    };
  } catch (error: any) {
    return {
      status: "CONSTRAINED",
      source: "GEOGLAM Crop Monitor",
      archiveUrl: GEOGLAM_ARCHIVE_URL,
      selectedCount: 0,
      note: `GEOGLAM archive unavailable: ${String(error?.message || "fetch_failed")}`,
      datasets: [],
    };
  }
}

function toSeries(values: any[] | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((point: any) => parseNum(point?.value))
    .filter((value): value is number => value != null)
    .slice(-24);
}

function formatCardValue(card: any): string {
  if (typeof card?.valueText === "string" && card.valueText.trim()) return card.valueText.trim();
  const value = parseNum(card?.value);
  return value == null ? "n/a" : `${value.toFixed(2)} pts`;
}

function pickCropRows(rows: any[], crop: YieldCrop) {
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const rowCrop = String(row?.crop || "").toUpperCase();
    if (crop === "ALL") return true;
    if (crop === "SOYBEAN") return rowCrop === "SOY" || rowCrop === "SOYBEAN" || rowCrop === "SOYBEANS";
    return rowCrop === crop;
  });
}

function buildFoodSecurity(byKind: GrainWidgetsByKind, crop: YieldCrop) {
  const wfpRowsRaw = Array.isArray(byKind?.WFP_MARKET_PRICES_MULTI_COUNTRY?.rows) ? byKind.WFP_MARKET_PRICES_MULTI_COUNTRY.rows : [];
  const wbRowsRaw = Array.isArray(byKind?.WB_MICRODATA_MARKET_PRICES?.rows) ? byKind.WB_MICRODATA_MARKET_PRICES.rows : [];
  const faoCards = Array.isArray(byKind?.CROP_PRICE_INDEX?.cards) ? byKind.CROP_PRICE_INDEX.cards : [];

  const wfpRows = pickCropRows(wfpRowsRaw, crop);
  const wbRows = pickCropRows(wbRowsRaw, crop);
  const allRows = [...wfpRows.map((row: any) => ({ ...row, _source: "WFP" as const })), ...wbRows.map((row: any) => ({ ...row, _source: "WB" as const }))];

  const localChanges = allRows
    .map((row) => parseNum(row?.changePct))
    .filter((value): value is number => value != null && value > 0);
  const localDeviation = localChanges.length ? Number((localChanges.reduce((acc, val) => acc + val, 0) / localChanges.length / 100).toFixed(6)) : null;

  const faoDeltas = faoCards
    .map((card: any): number | null => parseNum(card?.deltaPct))
    .filter((value: number | null): value is number => value != null && value > 0);
  const globalDeviation = faoDeltas.length
    ? Number((faoDeltas.reduce((acc: number, val: number) => acc + val, 0) / faoDeltas.length / 100).toFixed(6))
    : null;

  const localScore = localDeviation != null ? Number(clamp01(localDeviation / 0.5).toFixed(6)) : null;
  const globalScore = globalDeviation != null ? Number(clamp01(globalDeviation / 0.3).toFixed(6)) : null;
  const stressScore =
    localScore != null || globalScore != null
      ? Number(((0.7 * (localScore ?? 0) + 0.3 * (globalScore ?? 0))).toFixed(6))
      : null;

  const status: YieldStatus =
    stressScore != null ? "INDICATIVE" : allRows.length > 0 || faoCards.length > 0 ? "CONSTRAINED" : "CONSTRAINED";

  return {
    status,
    source: "WFP + World Bank + FAO blended layer",
    score: stressScore,
    localDeviation,
    globalDeviation,
    localScore,
    globalScore,
    marketRows: allRows.slice(0, 8).map((row) => ({
      source: row._source,
      crop: String(row?.crop || "n/a"),
      label: String(row?.label || row?.id || "Market row"),
      value: row?.current != null ? `${Number(row.current).toFixed(2)} ${String(row?.unit || "")}`.trim() : "n/a",
      changePct: parseNum(row?.changePct) ?? undefined,
      current: parseNum(row?.current) ?? undefined,
      unit: typeof row?.unit === "string" ? row.unit : undefined,
      currency: typeof row?.currency === "string" ? row.currency : undefined,
    })),
    note:
      stressScore != null
        ? "Stress score formula: 0.7*local + 0.3*global (WFP/WB positive deviation + FAO pressure)"
        : "Insufficient WFP/WB/FAO deltas to compute stress score",
  };
}

function buildFaoFoodPrices(byKind: GrainWidgetsByKind) {
  const widget = byKind?.CROP_PRICE_INDEX;
  const cards = Array.isArray(widget?.cards) ? widget.cards : [];
  const rows = cards.slice(0, 4).map((card: any) => ({
    label: String(card?.label || card?.id || "Index"),
    value: formatCardValue(card),
    deltaPct: parseNum(card?.deltaPct) ?? undefined,
    series: toSeries(card?.series),
  }));
  const status = String(widget?.status || "CONSTRAINED").toUpperCase() as YieldStatus;
  return {
    status,
    source: widget?.sourceName || "FAO FFPI",
    faoRows: rows,
  };
}

export async function getYieldFoodSecuritySnapshot(args: {
  country: string;
  crop?: string;
  forceRefresh?: boolean;
  byKind?: GrainWidgetsByKind;
}): Promise<YieldFoodSecurityPayload> {
  const country = String(args.country || "UA").toUpperCase();
  const crop = normalizeYieldCrop(args.crop);
  const key = `${country}:${crop}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (!args.forceRefresh && cached && now - cached.tsMs < CACHE_TTL_MS) {
    return { ...cached.payload, cacheHit: true };
  }

  const byKind = args.byKind || {};
  const [geoglam, foodPrices] = await Promise.all([fetchGeoglamDatasets(country, crop), Promise.resolve(buildFaoFoodPrices(byKind))]);
  const foodSecurity = buildFoodSecurity(byKind, crop);

  const payload: YieldFoodSecurityPayload = {
    generatedAt: new Date(now).toISOString(),
    cacheHit: false,
    country,
    crop,
    geoglam,
    foodPrices,
    foodSecurity,
  };

  cache.set(key, { tsMs: now, payload });
  return payload;
}
