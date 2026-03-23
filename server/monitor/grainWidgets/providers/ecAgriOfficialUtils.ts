import {
  EC_AGRI_API_BASE_URL,
  EC_AGRI_CACHE_TTL_MS,
  EC_AGRI_TIMEOUT_MS,
  EC_CEREALS_API_PATH,
  EC_CEREALS_MEMBER_STATES,
  EC_OILSEEDS_API_PATH,
  EC_OILSEEDS_MEMBER_STATES,
} from "../config";
import type { GrainWidgetPoint, GrainWidgetTableRow } from "../types";
import { fetchTextResponseWithTimeout, normalizeDate, normalizeRowPrice, parseNumber } from "./utils";

type EcMode = "cereal" | "oilseeds";
type EcDictionaryEntry = { code: string; label: string };
type EcPriceObservation = {
  ts: string;
  countryCode: string;
  productCode: string;
  productLabel: string;
  stageCode?: string;
  stageLabel?: string;
  marketCode?: string;
  marketLabel?: string;
  value: number;
  unit?: string;
};

type CacheValue = {
  fetchedAt: number;
  payload: any;
  finalUrl: string;
};

const cache = new Map<string, CacheValue>();

const territoryLabels: Record<string, string> = {
  FR: "France",
  DE: "Germany",
  PL: "Poland",
  RO: "Romania",
  ES: "Spain",
  BG: "Bulgaria",
};

const cropSynonyms: Record<string, string[]> = {
  soft_wheat: ["soft wheat", "common wheat", "bread wheat"],
  durum_wheat: ["durum wheat", "durum"],
  maize: ["maize", "corn"],
  barley: ["barley"],
  rye: ["rye"],
  rapeseed: ["rapeseed", "canola"],
  sunflower: ["sunflower", "sunflower seed", "sunseed"],
  soybeans: ["soybeans", "soybean", "soy beans", "soy"],
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBaseCandidates(mode: EcMode): string[] {
  const path = mode === "cereal" ? EC_CEREALS_API_PATH : EC_OILSEEDS_API_PATH;
  const configuredBase = EC_AGRI_API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const origin = (() => {
    try {
      return new URL(configuredBase).origin;
    } catch {
      return configuredBase;
    }
  })();

  return Array.from(
    new Set(
      [
        `${configuredBase}/${normalizedPath}`,
        `${origin}/${normalizedPath}`,
        `${origin}/extensions/${normalizedPath}`,
      ].map((value) => value.replace(/([^:]\/)\/+/g, "$1")),
    ),
  );
}

function dictionaryPath(mode: EcMode, kind: "products" | "stages" | "markets"): string {
  if (mode === "oilseeds") {
    if (kind === "stages") return "marketStages";
    if (kind === "markets") return "markets";
    return "products";
  }
  return kind;
}

export function resolveEcTerritory(mode: EcMode, requestedCountry?: string): { code: string; label: string; supported: Array<{ code: string; label: string }> } {
  const supportedCodes = mode === "cereal" ? EC_CEREALS_MEMBER_STATES : EC_OILSEEDS_MEMBER_STATES;
  const normalized = String(requestedCountry || supportedCodes[0] || "FR").toUpperCase();
  const code = supportedCodes.includes(normalized) ? normalized : supportedCodes[0] || "FR";
  return {
    code,
    label: territoryLabels[code] || code,
    supported: supportedCodes.map((entry) => ({ code: entry, label: territoryLabels[entry] || entry })),
  };
}

async function fetchJsonCached(url: string): Promise<{ payload: any; finalUrl: string }> {
  const cached = cache.get(url);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= EC_AGRI_CACHE_TTL_MS) {
    return { payload: cached.payload, finalUrl: cached.finalUrl };
  }
  const response = await fetchTextResponseWithTimeout(url, EC_AGRI_TIMEOUT_MS, {
    accept: "application/json,text/plain,*/*",
  });
  const payload = JSON.parse(response.text);
  cache.set(url, {
    fetchedAt: now,
    payload,
    finalUrl: response.finalUrl || url,
  });
  return { payload, finalUrl: response.finalUrl || url };
}

async function fetchJsonResolved(urls: string[]): Promise<{ payload: any; finalUrl: string; attemptedUrls: string[] }> {
  const attemptedUrls: string[] = [];
  let lastError: any;
  for (const url of urls) {
    attemptedUrls.push(url);
    try {
      const result = await fetchJsonCached(url);
      return { ...result, attemptedUrls };
    } catch (error: any) {
      lastError = error;
    }
  }
  if (lastError && attemptedUrls.length) {
    Object.assign(lastError, { attemptedUrls });
  }
  throw lastError || new Error("ec_request_failed");
}

function asArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function toDictionaryEntry(row: any): EcDictionaryEntry | undefined {
  if (typeof row === "string") {
    const value = row.trim();
    return value ? { code: value, label: value } : undefined;
  }
  const code = String(row?.code ?? row?.productCode ?? row?.stageCode ?? row?.marketCode ?? row?.id ?? "").trim();
  const label = String(row?.label ?? row?.name ?? row?.description ?? row?.productName ?? row?.stageName ?? row?.marketName ?? "").trim();
  if (!code || !label) return undefined;
  return { code, label };
}

export async function fetchEcDictionary(mode: EcMode, kind: "products" | "stages" | "markets"): Promise<{ entries: EcDictionaryEntry[]; sourceUrlUsed: string }> {
  const urls = buildBaseCandidates(mode).map((base) => `${base}/${dictionaryPath(mode, kind)}`);
  const { payload, finalUrl } = await fetchJsonResolved(urls);
  return {
    entries: asArray(payload).map(toDictionaryEntry).filter((entry): entry is EcDictionaryEntry => Boolean(entry)),
    sourceUrlUsed: finalUrl,
  };
}

function resolveProductCodes(entries: EcDictionaryEntry[], keys: string[]): Array<{ key: string; code: string; label: string }> {
  const resolved: Array<{ key: string; code: string; label: string }> = [];
  for (const key of keys) {
    const synonyms = cropSynonyms[key] || [key];
    const match = entries.find((entry) => synonyms.some((token) => normalizeText(entry.label).includes(normalizeText(token))));
    if (match) resolved.push({ key, code: match.code, label: match.label });
  }
  return resolved;
}

function resolvePreferredStage(entries: EcDictionaryEntry[]): EcDictionaryEntry | undefined {
  const ranked = [
    "depport",
    "port",
    "fob",
    "silo",
    "farm gate",
    "farmgate",
  ];
  for (const token of ranked) {
    const found = entries.find((entry) => normalizeText(entry.code) === token || normalizeText(entry.label).includes(token));
    if (found) return found;
  }
  return entries[0];
}

function detectDate(row: any): string | undefined {
  return (
    normalizeDate(row?.date) ||
    normalizeDate(row?.quotedDate) ||
    normalizeDate(row?.quotationDate) ||
    normalizeDate(row?.beginDate) ||
    normalizeDate(row?.endDate) ||
    normalizeDate(row?.week) ||
    normalizeDate(row?.month) ||
    normalizeDate(row?.period)
  );
}

function detectValue(row: any): number | undefined {
  return (
    parseNumber(row?.price) ??
    parseNumber(row?.valueAmount) ??
    parseNumber(row?.value) ??
    parseNumber(row?.avgPrice) ??
    parseNumber(row?.averagePrice) ??
    parseNumber(row?.marketPrice)
  );
}

function detectUnit(row: any): string | undefined {
  return String(row?.unit ?? row?.unitCode ?? row?.uom ?? row?.measureUnit ?? row?.unitLabel ?? "").trim() || undefined;
}

function mapProductLabel(productLabel: string, fallback: string): string {
  const norm = normalizeText(productLabel);
  if (norm.includes("soft wheat") || norm.includes("common wheat")) return "Soft Wheat";
  if (norm.includes("durum")) return "Durum Wheat";
  if (norm.includes("maize") || norm.includes("corn")) return "Maize (Corn)";
  if (norm.includes("barley")) return "Barley";
  if (norm.includes("rye")) return "Rye";
  if (norm.includes("rapeseed") || norm.includes("canola")) return "Rapeseed (Canola)";
  if (norm.includes("sunflower")) return "Sunflower seed";
  if (norm.includes("soy")) return "Soybeans";
  return fallback;
}

function toSeries(rows: EcPriceObservation[], points: number): GrainWidgetPoint[] {
  return rows
    .map((row) => ({ ts: row.ts, value: Number(row.value.toFixed(4)) }))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-Math.max(6, points));
}

function deriveCadence(series: GrainWidgetPoint[]): "weekly" | "monthly" | "annual" | "unknown" {
  if (series.length < 3) return "unknown";
  const times = series.map((point) => Date.parse(point.ts)).filter(Number.isFinite).sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < times.length; i += 1) diffs.push(Math.round((times[i] - times[i - 1]) / 86_400_000));
  if (!diffs.length) return "unknown";
  const median = diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  if (median <= 10) return "weekly";
  if (median <= 45) return "monthly";
  if (median > 200) return "annual";
  return "unknown";
}

function mapNativeUnitType(unit?: string): "EUR_PER_TON" | "USD_PER_TON" | "UNKNOWN" {
  const norm = normalizeText(unit);
  if (norm.includes("eur/t") || norm.includes("eur tonne") || norm.includes("euro/t")) return "EUR_PER_TON";
  if (norm.includes("usd/t") || norm.includes("usd tonne")) return "USD_PER_TON";
  return "UNKNOWN";
}

function normalizeUnitValue(value: number, unit?: string): { value: number; unit: string } {
  const norm = normalizeText(unit);
  if (norm.includes("100 kg") || norm.includes("/100kg")) {
    return { value: Number((value * 10).toFixed(4)), unit: unit?.replace(/100\s?kg/i, "t").replace(/\/100kg/i, "/t") || "EUR/t" };
  }
  return { value, unit: unit || "price" };
}

export async function fetchEcPriceRows(args: {
  mode: EcMode;
  countryCode: string;
  productKeys: string[];
  eurUsd: number | null;
  seriesPoints: number;
}): Promise<{
  rows: GrainWidgetTableRow[];
  sourceUrlUsed: string;
  attemptedUrls: string[];
  stageCodes: string[];
  productCodes: string[];
  marketCodes: string[];
  rowsParsed: number;
  cadence: "weekly" | "monthly" | "annual" | "unknown";
  warnings: string[];
  stageLabel?: string;
}> {
  const warnings: string[] = [];
  const products = await fetchEcDictionary(args.mode, "products");
  const productMatches = resolveProductCodes(products.entries, args.productKeys);
  if (!productMatches.length) throw new Error(`ec_${args.mode}_products_not_found`);

  let stageCodes: string[] = [];
  let stageLabel: string | undefined;
  try {
    const stages = await fetchEcDictionary(args.mode, "stages");
    const preferredStage = resolvePreferredStage(stages.entries);
    if (preferredStage) {
      stageCodes = [preferredStage.code];
      stageLabel = preferredStage.label;
    }
  } catch (error: any) {
    warnings.push(`stages:${String(error?.message || "fetch_failed").slice(0, 90)}`);
  }

  const params = new URLSearchParams();
  if (args.mode === "oilseeds") {
    params.set("memberStateCodes", args.countryCode);
    params.set("products", productMatches.map((entry) => entry.code).join(","));
    if (stageCodes.length) params.set("marketStages", stageCodes.join(","));
  } else {
    params.set("memberStateCodes", args.countryCode);
    params.set("productCodes", productMatches.map((entry) => entry.code).join(","));
    if (stageCodes.length) params.set("stageCodes", stageCodes.join(","));
  }
  const urls = buildBaseCandidates(args.mode).map((base) => `${base}/prices?${params.toString()}`);
  const { payload, finalUrl, attemptedUrls } = await fetchJsonResolved(urls);
  const rawRows = asArray(payload);
  if (!rawRows.length) throw new Error(`ec_${args.mode}_prices_empty`);

  const observations: EcPriceObservation[] = [];
  for (const row of rawRows) {
    const ts = detectDate(row);
    const value = detectValue(row);
    const productCode = String(row?.productCode ?? row?.product_code ?? row?.product ?? row?.productName ?? "").trim();
    const productLabel =
      String(row?.productName ?? row?.productLabel ?? row?.product ?? "").trim() ||
      productMatches.find((entry) => entry.code === productCode)?.label ||
      productCode;
    const countryCode = String(row?.memberStateCode ?? row?.countryCode ?? row?.member_state ?? args.countryCode).trim().toUpperCase();
    if (!ts || value == null || !productCode || countryCode !== args.countryCode) continue;
    observations.push({
      ts,
      countryCode,
      productCode,
      productLabel,
      stageCode: String(row?.stageCode ?? row?.stage ?? row?.marketStage ?? "").trim() || undefined,
      stageLabel: String(row?.stageName ?? row?.stageLabel ?? row?.marketStageLabel ?? row?.marketStage ?? "").trim() || undefined,
      marketCode: String(row?.marketCode ?? row?.market ?? "").trim() || undefined,
      marketLabel: String(row?.marketName ?? row?.marketLabel ?? "").trim() || undefined,
      value,
      unit: detectUnit(row),
    });
  }

  if (!observations.length) throw new Error(`ec_${args.mode}_mappable_rows_empty`);

  const marketCodes = Array.from(new Set(observations.map((row) => row.marketCode).filter(Boolean))) as string[];
  const grouped = new Map<string, EcPriceObservation[]>();
  for (const row of observations) {
    if (!grouped.has(row.productCode)) grouped.set(row.productCode, []);
    grouped.get(row.productCode)!.push(row);
  }

  const rows: GrainWidgetTableRow[] = [];
  let cadence: "weekly" | "monthly" | "annual" | "unknown" = "unknown";
  for (const match of productMatches) {
    const seriesRows = (grouped.get(match.code) || []).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (!seriesRows.length) continue;
    const latest = seriesRows[seriesRows.length - 1];
    const prev = seriesRows.length > 1 ? seriesRows[seriesRows.length - 2] : undefined;
    const normalizedUnit = normalizeUnitValue(latest.value, latest.unit);
    const prevNormalized = prev ? normalizeUnitValue(prev.value, prev.unit || latest.unit) : undefined;
    const series = toSeries(seriesRows.map((row) => {
      const normalized = normalizeUnitValue(row.value, row.unit || latest.unit);
      return { ...row, value: normalized.value, unit: normalized.unit };
    }), args.seriesPoints);
    const rowCadence = deriveCadence(series);
    if (cadence === "unknown") cadence = rowCadence;
    rows.push(
      normalizeRowPrice({
        row: {
          id: `ec-${args.mode}-${args.countryCode}-${match.code}`,
          label: mapProductLabel(match.label, match.label),
          region: territoryLabels[args.countryCode] || args.countryCode,
          commodityGroup: args.mode === "cereal" ? "Grains" : "Oilseeds",
          sourceName: "EC Agri-food Data Portal",
          sourceAttribution: "Data: European Commission Agri-food Data Portal",
          updatedAt: latest.ts,
          status: "REFRESH",
          price: {
            nativeValueCurrent: normalizedUnit.value,
            nativeValueChange: prevNormalized ? Number((normalizedUnit.value - prevNormalized.value).toFixed(4)) : undefined,
            nativeValueChangePct: prevNormalized && prevNormalized.value !== 0
              ? Number((((normalizedUnit.value - prevNormalized.value) / prevNormalized.value) * 100).toFixed(2))
              : undefined,
            nativeCurrency: normalizedUnit.unit.toUpperCase().includes("EUR") ? "EUR" : normalizedUnit.unit.toUpperCase().includes("USD") ? "USD" : undefined,
            nativeUnit: normalizedUnit.unit,
            normalizationStatus: "UNAVAILABLE",
            series,
          },
          notes: [
            ...(stageLabel ? [`stage:${stageLabel}`] : []),
            ...(latest.marketLabel ? [`market:${latest.marketLabel}`] : []),
          ],
        },
        eurUsd: args.eurUsd,
        crop:
          args.mode === "cereal"
            ? match.key === "maize"
              ? "corn"
              : match.key.includes("wheat")
                ? "wheat"
                : undefined
            : match.key === "soybeans"
              ? "soybeans"
              : undefined,
        nativeUnitType: mapNativeUnitType(normalizedUnit.unit),
      }),
    );
  }

  return {
    rows,
    sourceUrlUsed: finalUrl,
    attemptedUrls,
    stageCodes,
    productCodes: productMatches.map((entry) => entry.code),
    marketCodes,
    rowsParsed: observations.length,
    cadence,
    warnings,
    stageLabel,
  };
}
