import {
  ALPHAVANTAGE_API_KEY,
  ALPHAVANTAGE_BACKOFF_MS,
  ALPHAVANTAGE_BASE_URL,
  ALPHAVANTAGE_CACHE_TTL_MS,
  ALPHAVANTAGE_FUNCTIONS,
  ALPHAVANTAGE_INTERVAL,
  ALPHAVANTAGE_RATE_LIMIT_PER_MIN,
  ALPHAVANTAGE_TIMEOUT_MS,
  ALPHAVANTAGE_UNIT_MAP,
  ENABLE_ALPHAVANTAGE_PROVIDER,
} from "../config";
import type {
  AlphaVantageUnitConfidence,
  GrainWidgetAlphaVantageBenchmarkRow,
  GrainWidgetAlphaVantageGrainBenchmarks,
  GrainWidgetPoint,
  GrainWidgetTableRow,
} from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { normalizeRowPrice, parseNumber, statusFromAvailability } from "./utils";

type NativeUnitType = "CENTS_PER_BUSHEL" | "USD_PER_BUSHEL" | "USD_PER_TON" | "EUR_PER_TON" | "UNKNOWN";

type UnitRegistryEntry = {
  label: string;
  unitConfidence: AlphaVantageUnitConfidence;
  metricSemanticKind?: "price" | "index";
  nativeUnitType?: NativeUnitType;
  crop?: "corn" | "wheat" | "soybeans";
};

type ParsedPoint = { ts: string; value: number };
type FunctionSnapshot = {
  fetchedAt: number;
  sourceUrlUsed: string;
  cached: boolean;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  momChangePct?: number;
  yoyChangePct?: number;
  points: GrainWidgetPoint[];
  notes: string[];
  error?: string;
  unitLabel: string;
  unitConfidence: AlphaVantageUnitConfidence;
  allowNormalization: boolean;
  metricSemanticKind: "price" | "index";
  crop?: "corn" | "wheat" | "soybeans";
  nativeUnitType: NativeUnitType;
};

const DEFAULT_FUNCTIONS = ["WHEAT", "CORN"];

const DEFAULT_UNIT_REGISTRY: Record<string, UnitRegistryEntry> = {
  WHEAT: {
    label: "USD (unit unknown)",
    unitConfidence: "UNKNOWN",
    metricSemanticKind: "price",
    nativeUnitType: "UNKNOWN",
    crop: "wheat",
  },
  CORN: {
    label: "USD (unit unknown)",
    unitConfidence: "UNKNOWN",
    metricSemanticKind: "price",
    nativeUnitType: "UNKNOWN",
    crop: "corn",
  },
  SOYBEANS: {
    label: "USD (unit unknown)",
    unitConfidence: "UNKNOWN",
    metricSemanticKind: "price",
    nativeUnitType: "UNKNOWN",
    crop: "soybeans",
  },
  SOYBEAN_OIL: {
    label: "USD (unit unknown)",
    unitConfidence: "UNKNOWN",
    metricSemanticKind: "price",
    nativeUnitType: "UNKNOWN",
  },
  SOYBEAN_MEAL: {
    label: "USD (unit unknown)",
    unitConfidence: "UNKNOWN",
    metricSemanticKind: "price",
    nativeUnitType: "UNKNOWN",
  },
  ALL_COMMODITIES: {
    label: "USD (unit unknown)",
    unitConfidence: "UNKNOWN",
    metricSemanticKind: "index",
    nativeUnitType: "UNKNOWN",
  },
};

const functionCache = new Map<string, FunctionSnapshot>();
let lastRequestAtMs = 0;
let backoffUntilMs = 0;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeAlphaSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("apikey")) {
      parsed.searchParams.set("apikey", "REDACTED");
    }
    return parsed.toString();
  } catch {
    return url.replace(/apikey=[^&]+/gi, "apikey=REDACTED");
  }
}

function buildAlphaUrl(fn: string): string {
  const url = new URL(ALPHAVANTAGE_BASE_URL);
  url.searchParams.set("function", fn);
  url.searchParams.set("interval", ALPHAVANTAGE_INTERVAL);
  url.searchParams.set("apikey", ALPHAVANTAGE_API_KEY);
  return url.toString();
}

function functionLabel(fn: string): string {
  return fn
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function parseUnitRegistry(): Record<string, UnitRegistryEntry> {
  if (!ALPHAVANTAGE_UNIT_MAP) return DEFAULT_UNIT_REGISTRY;
  try {
    const parsed = JSON.parse(ALPHAVANTAGE_UNIT_MAP);
    const registry: Record<string, UnitRegistryEntry> = { ...DEFAULT_UNIT_REGISTRY };
    for (const [key, raw] of Object.entries(parsed || {})) {
      const fn = String(key || "").toUpperCase();
      if (!fn || !raw || typeof raw !== "object") continue;
      const candidate = raw as Partial<UnitRegistryEntry>;
      const confidence = candidate.unitConfidence;
      const normalizedConfidence: AlphaVantageUnitConfidence =
        confidence === "CONFIRMED" || confidence === "ASSUMED" || confidence === "UNKNOWN"
          ? confidence
          : "UNKNOWN";
      registry[fn] = {
        label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : (registry[fn]?.label || "USD (unit unknown)"),
        unitConfidence: normalizedConfidence,
        metricSemanticKind: candidate.metricSemanticKind === "index" ? "index" : "price",
        nativeUnitType: candidate.nativeUnitType || "UNKNOWN",
        crop: candidate.crop,
      };
    }
    return registry;
  } catch {
    return DEFAULT_UNIT_REGISTRY;
  }
}

function parseIsoDate(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return undefined;
  return new Date(ts).toISOString();
}

function extractPoints(payload: any): ParsedPoint[] {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.values)
      ? payload.values
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
  const points = rows
    .map((row: any) => {
      const ts = parseIsoDate(row?.date || row?.timestamp || row?.time || row?.datetime);
      const value = parseNumber(row?.value ?? row?.close ?? row?.price);
      if (!ts || value == null) return undefined;
      return { ts, value: Number(value.toFixed(6)) };
    })
    .filter((point: ParsedPoint | undefined): point is ParsedPoint => Boolean(point))
    .sort((a: ParsedPoint, b: ParsedPoint) => Date.parse(a.ts) - Date.parse(b.ts));
  return points;
}

function detectAllowNormalization(entry: UnitRegistryEntry): boolean {
  return entry.unitConfidence === "CONFIRMED" && entry.metricSemanticKind !== "index" && entry.nativeUnitType !== "UNKNOWN";
}

function detectUnitFromPayload(payload: any, fallback: UnitRegistryEntry): UnitRegistryEntry {
  const rawUnit = String(payload?.unit || payload?.metadata?.unit || payload?.["Meta Data"]?.unit || "").toLowerCase();
  if (!rawUnit) return fallback;
  if (rawUnit.includes("c/bu") || rawUnit.includes("cents")) {
    return { ...fallback, label: "c/bu", unitConfidence: "CONFIRMED", nativeUnitType: "CENTS_PER_BUSHEL" };
  }
  if (rawUnit.includes("usd/bu") || rawUnit.includes("$/bu")) {
    return { ...fallback, label: "USD/bu", unitConfidence: "CONFIRMED", nativeUnitType: "USD_PER_BUSHEL" };
  }
  if (rawUnit.includes("usd/t") || rawUnit.includes("$/t") || rawUnit.includes("usd/ton")) {
    return { ...fallback, label: "USD/t", unitConfidence: "CONFIRMED", nativeUnitType: "USD_PER_TON" };
  }
  if (rawUnit.includes("index") || rawUnit.includes("pts")) {
    return { ...fallback, label: "index pts", unitConfidence: "ASSUMED", metricSemanticKind: "index", nativeUnitType: "UNKNOWN" };
  }
  return fallback;
}

function classifyAlphaError(error: string): string {
  const upper = error.toUpperCase();
  if (upper.includes("ENOTFOUND")) return "DNS";
  if (upper.includes("ETIMEDOUT") || upper.includes("ABORT_ERR") || upper.includes("TIMEOUT")) return "TIMEOUT";
  if (upper.includes("RATE_LIMIT")) return "RATE_LIMIT";
  const http = error.match(/HTTP\s+(\d{3})/i);
  if (http) {
    const code = Number.parseInt(http[1], 10);
    if (code >= 400 && code < 500) return "HTTP_4XX";
    if (code >= 500) return "HTTP_5XX";
  }
  if (upper.includes("PARSE")) return "PARSE_ERROR";
  if (upper.includes("EMPTY")) return "EMPTY_DATA";
  return "UNKNOWN";
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CroptoMonitor/1.1 (+https://cropto.abvx.xyz)",
        accept: "application/json,text/plain,*/*",
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(text);
  } catch (error: any) {
    const message = String(error?.message || "alphavantage_fetch_failed");
    if (message.includes("Unexpected token")) {
      throw new Error(`PARSE_ERROR:${message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFunctionSnapshot(args: {
  fn: string;
  registry: Record<string, UnitRegistryEntry>;
  pointsLimit: number;
}): Promise<FunctionSnapshot> {
  const now = Date.now();
  const cached = functionCache.get(args.fn);
  if (cached && now - cached.fetchedAt <= ALPHAVANTAGE_CACHE_TTL_MS) {
    return { ...cached, cached: true };
  }

  if (backoffUntilMs > now) {
    if (cached) {
      return {
        ...cached,
        cached: true,
        notes: [...cached.notes, `backoff_active_until:${new Date(backoffUntilMs).toISOString()}`],
      };
    }
    throw new Error(`RATE_LIMIT:backoff_active_until_${new Date(backoffUntilMs).toISOString()}`);
  }

  const minIntervalMs = Math.ceil(60_000 / Math.max(1, ALPHAVANTAGE_RATE_LIMIT_PER_MIN));
  const sinceLastRequest = now - lastRequestAtMs;
  if (sinceLastRequest < minIntervalMs) {
    await sleep(minIntervalMs - sinceLastRequest);
  }
  lastRequestAtMs = Date.now();

  const sourceUrlRaw = buildAlphaUrl(args.fn);
  const sourceUrlUsed = sanitizeAlphaSourceUrl(sourceUrlRaw);
  const payload = await fetchJsonWithTimeout(sourceUrlRaw, ALPHAVANTAGE_TIMEOUT_MS);

  if (payload?.["Error Message"]) {
    throw new Error(`HTTP_4XX:${String(payload["Error Message"])}`);
  }
  if (payload?.Note && String(payload.Note).toLowerCase().includes("call frequency")) {
    backoffUntilMs = Date.now() + ALPHAVANTAGE_BACKOFF_MS;
    throw new Error(`RATE_LIMIT:${String(payload.Note)}`);
  }

  const defaultUnit = args.registry[args.fn] || DEFAULT_UNIT_REGISTRY[args.fn] || DEFAULT_UNIT_REGISTRY.WHEAT;
  const detectedUnit = detectUnitFromPayload(payload, defaultUnit);
  const allowNormalization = detectAllowNormalization(detectedUnit);
  const points = extractPoints(payload).slice(-Math.max(args.pointsLimit, 6));
  if (points.length < 2) {
    throw new Error("EMPTY_DATA:series_too_short");
  }

  const latest = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : undefined;
  const oneYearAgo = points.length > 12 ? points[points.length - 13] : undefined;
  const valueCurrent = latest.value;
  const valueChange = prev ? Number((latest.value - prev.value).toFixed(4)) : undefined;
  const momChangePct = prev && prev.value !== 0 ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2)) : undefined;
  const yoyChangePct = oneYearAgo && oneYearAgo.value !== 0
    ? Number((((latest.value - oneYearAgo.value) / oneYearAgo.value) * 100).toFixed(2))
    : undefined;
  const snapshot: FunctionSnapshot = {
    fetchedAt: Date.now(),
    sourceUrlUsed,
    cached: false,
    valueCurrent,
    valueChange,
    valueChangePct: momChangePct,
    momChangePct,
    yoyChangePct,
    points,
    notes: [
      `interval:${ALPHAVANTAGE_INTERVAL}`,
      `cadence:${ALPHAVANTAGE_INTERVAL.toLowerCase()}`,
      ...(detectedUnit.unitConfidence !== "CONFIRMED" ? ["unit_unverified"] : []),
    ],
    unitLabel: detectedUnit.label,
    unitConfidence: detectedUnit.unitConfidence,
    allowNormalization,
    metricSemanticKind: detectedUnit.metricSemanticKind || "price",
    crop: detectedUnit.crop,
    nativeUnitType: allowNormalization ? (detectedUnit.nativeUnitType || "UNKNOWN") : "UNKNOWN",
  };
  functionCache.set(args.fn, snapshot);
  return snapshot;
}

function normalizationCoverage(rows: GrainWidgetTableRow[]) {
  return {
    ok: rows.filter((row) => row.price?.normalizationStatus === "OK").length,
    partial: rows.filter((row) => row.price?.normalizationStatus === "PARTIAL").length,
    fxMissing: rows.filter((row) => row.price?.normalizationStatus === "FX_MISSING").length,
    unavailable: rows.filter((row) => row.price?.normalizationStatus === "UNAVAILABLE" || !row.price?.normalizationStatus).length,
  };
}

export class AlphaVantageCommoditiesProvider implements GrainWidgetsProvider {
  id = "alpha-vantage-commodities";
  kind = "ALPHAVANTAGE_GRAIN_BENCHMARKS" as const;
  enabled = ENABLE_ALPHAVANTAGE_PROVIDER;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "ALPHAVANTAGE_GRAIN_BENCHMARKS" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetAlphaVantageGrainBenchmarks> {
    if (!ALPHAVANTAGE_API_KEY) throw new Error("no_key:ALPHAVANTAGE_API_KEY");

    const functions = (ALPHAVANTAGE_FUNCTIONS.length ? ALPHAVANTAGE_FUNCTIONS : DEFAULT_FUNCTIONS)
      .map((value) => String(value || "").toUpperCase())
      .filter(Boolean);
    const registry = parseUnitRegistry();
    const rows: GrainWidgetAlphaVantageBenchmarkRow[] = [];
    const notes: string[] = ["Alpha Vantage commodities (free tier, cached)"];
    let lastSourceUrlUsed: string | undefined;
    let rateLimitSeen = false;
    const byFunction: NonNullable<GrainWidgetAlphaVantageGrainBenchmarks["summary"]>["byFunction"] = [];

    for (const fn of functions) {
      try {
        const snapshot = await fetchFunctionSnapshot({
          fn,
          registry,
          pointsLimit: Math.max(12, ctx.seriesPoints),
        });
        lastSourceUrlUsed = snapshot.sourceUrlUsed;
        const rowBase: GrainWidgetAlphaVantageBenchmarkRow = {
          id: `av-${fn.toLowerCase()}`,
          alphaFunction: fn,
          label: functionLabel(fn),
          region: "Global",
          commodityGroup: fn.includes("SOY") || fn.includes("CANOLA") || fn.includes("RAPESEED") ? "Oilseeds" : "Grains",
          metricSemanticKind: snapshot.metricSemanticKind === "index" ? "index" : "price",
          status: statusFromAvailability({
            hasValue: snapshot.valueCurrent != null,
            indicative: snapshot.cached || snapshot.unitConfidence !== "CONFIRMED",
          }),
          sourceName: "Alpha Vantage",
          sourceAttribution: "Data: Alpha Vantage Commodities",
          updatedAt: new Date(snapshot.fetchedAt).toISOString(),
          notes: snapshot.notes,
          unitConfidence: snapshot.unitConfidence,
          allowNormalization: snapshot.allowNormalization,
          momChangePct: snapshot.momChangePct,
          yoyChangePct: snapshot.yoyChangePct,
          price: {
            nativeValueCurrent: snapshot.valueCurrent,
            nativeValueChange: snapshot.valueChange,
            nativeValueChangePct: snapshot.valueChangePct,
            nativeCurrency: "USD",
            nativeUnit: snapshot.unitLabel,
            normalizationStatus: "UNAVAILABLE",
            series: snapshot.points,
          },
          tags: [
            `unit:${snapshot.unitLabel}`,
            `unitConfidence:${snapshot.unitConfidence}`,
            `allowNormalization:${snapshot.allowNormalization ? "true" : "false"}`,
            ...(snapshot.cached ? ["cache_hit"] : []),
          ],
        };
        const row = snapshot.allowNormalization
          ? (normalizeRowPrice({
              row: rowBase,
              eurUsd: ctx.eurUsd,
              crop: snapshot.crop,
              nativeUnitType: snapshot.nativeUnitType,
            }) as GrainWidgetAlphaVantageBenchmarkRow)
          : rowBase;
        rows.push(row);
        byFunction?.push({
          fn,
          unitLabel: snapshot.unitLabel,
          unitConfidence: snapshot.unitConfidence,
          allowNormalization: snapshot.allowNormalization,
          seriesPoints: snapshot.points.length,
          cacheHit: snapshot.cached,
        });
      } catch (error: any) {
        const message = String(error?.message || "fetch_failed");
        if (message.includes("RATE_LIMIT")) rateLimitSeen = true;
        notes.push(`${fn}:${classifyAlphaError(message)}`);
      }
    }

    const mappedCount = rows.filter((row) => row.price?.nativeValueCurrent != null || row.price?.normalizedValueCurrent != null).length;
    const expectedCount = functions.length;
    const status = mappedCount >= Math.min(2, expectedCount)
      ? (rateLimitSeen ? "DELAYED" : "REFRESH")
      : mappedCount > 0
        ? "INDICATIVE"
        : "OFFLINE";
    if (!mappedCount) {
      throw new Error(notes.find((note) => note.includes(":")) || "coverage_empty");
    }

    return {
      id: "grain-alpha-vantage-benchmarks",
      kind: "ALPHAVANTAGE_GRAIN_BENCHMARKS",
      title: "Alpha Vantage Grain Benchmarks",
      subtitle: `Functions: ${functions.join(", ")}`,
      status,
      sourceName: "Alpha Vantage",
      sourceAttribution: "Data: Alpha Vantage Commodities",
      sourceUrl: lastSourceUrlUsed || sanitizeAlphaSourceUrl(buildAlphaUrl(functions[0] || "WHEAT")),
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      rows,
      summary: {
        expectedCount,
        mappedCount,
        coverage: `${mappedCount}/${expectedCount}`,
        cadence: ALPHAVANTAGE_INTERVAL.toLowerCase() === "daily"
          ? "daily"
          : ALPHAVANTAGE_INTERVAL.toLowerCase() === "weekly"
            ? "weekly"
            : ALPHAVANTAGE_INTERVAL.toLowerCase() === "monthly"
              ? "monthly"
              : "unknown",
        normalizedCoverage: normalizationCoverage(rows),
        byFunction,
      },
      notes,
      fallbackReason: mappedCount > 0 ? undefined : "coverage_empty",
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetAlphaVantageGrainBenchmarks {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetAlphaVantageGrainBenchmarks;
  }
}
