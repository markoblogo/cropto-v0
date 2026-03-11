import { fetchWithHeaders } from "./grainWidgets/providers/utils";
import { getBinanceMarketSnapshot } from "./binanceMarketService";

const TWELVEDATA_BASE_URL = process.env.TWELVEDATA_BASE_URL || "https://api.twelvedata.com";
const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || "";
const YAHOO_CHART_BASE_URL = process.env.MONITOR_YAHOO_CHART_BASE_URL || "https://query1.finance.yahoo.com/v8/finance/chart";
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_GLOBAL_INDICES_FETCH_TIMEOUT_MS || "7000", 10);
const CACHE_TTL_MS = Number.parseInt(process.env.MONITOR_GLOBAL_INDICES_CACHE_TTL_MS || String(10 * 60 * 1000), 10);

export type GlobalIndexStatus = "REFRESH" | "INDICATIVE" | "CONSTRAINED";

export type GlobalIndexDef = {
  symbol: string;
  name: string;
  region: "US" | "EU" | "EM" | "BR" | "AR";
  provider: "twelvedata";
  providerSymbol: string;
  currency: string;
};

export type GlobalIndexRow = {
  symbol: string;
  name: string;
  region: string;
  value: number | null;
  dayChangePct: number | null;
  provider: string;
  source: "eod" | "intraday" | "fallback";
  series: number[];
  status: GlobalIndexStatus;
  note?: string;
};

export type GlobalIndicesPayload = {
  generatedAt: string;
  cacheHit: boolean;
  status: GlobalIndexStatus;
  providerMode: "twelvedata" | "fallback";
  rows: GlobalIndexRow[];
  riskOnOff: {
    regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
    score: number | null;
    matrix: Array<{ label: string; value: number | null }>;
    note: string;
  };
  crossAsset: {
    btc: number | null;
    gold: number | null;
    oil: number | null;
    dxy: number | null;
    note: string;
  };
};

export const GLOBAL_INDEX_DEFS: GlobalIndexDef[] = [
  { symbol: "SPX", name: "S&P 500", region: "US", provider: "twelvedata", providerSymbol: "SPX", currency: "USD" },
  { symbol: "IXIC", name: "Nasdaq Composite", region: "US", provider: "twelvedata", providerSymbol: "IXIC", currency: "USD" },
  { symbol: "DJI", name: "Dow Jones", region: "US", provider: "twelvedata", providerSymbol: "DJI", currency: "USD" },
  { symbol: "DAX", name: "DAX", region: "EU", provider: "twelvedata", providerSymbol: "DAX", currency: "EUR" },
  { symbol: "CAC40", name: "CAC 40", region: "EU", provider: "twelvedata", providerSymbol: "FCHI", currency: "EUR" },
  { symbol: "STOXX50E", name: "EuroStoxx 50", region: "EU", provider: "twelvedata", providerSymbol: "SX5E", currency: "EUR" },
  { symbol: "MXEF", name: "MSCI Emerging", region: "EM", provider: "twelvedata", providerSymbol: "MXEF", currency: "USD" },
  { symbol: "BVSP", name: "Ibovespa", region: "BR", provider: "twelvedata", providerSymbol: "BVSP", currency: "BRL" },
  { symbol: "MERV", name: "Merval", region: "AR", provider: "twelvedata", providerSymbol: "MERV", currency: "ARS" },
];

let cache: { tsMs: number; payload: GlobalIndicesPayload } | null = null;

function parseFloatSafe(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithHeaders(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retryOnStatuses: [429, 500, 502, 503, 504],
    headers: {
      accept: "application/json",
      "user-agent": "CroptoMonitor/global-indices-service",
    },
  });
  const text = await response.text();
  return JSON.parse(text) as T;
}

async function loadTwelveDataSeries(symbol: string) {
  const url = `${TWELVEDATA_BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=40&apikey=${encodeURIComponent(TWELVEDATA_API_KEY)}`;
  const payload = await fetchJson<any>(url);
  const values = Array.isArray(payload?.values) ? payload.values : [];
  const ordered = [...values].reverse().map((row: any) => parseFloatSafe(row?.close)).filter((n: number | null): n is number => n != null);
  if (ordered.length < 2) return null;
  const latest = ordered[ordered.length - 1];
  const prev = ordered[ordered.length - 2];
  const dayChangePct = prev && prev !== 0 ? Number((((latest - prev) / prev) * 100).toFixed(4)) : null;
  return {
    value: latest,
    dayChangePct,
    series: ordered.slice(-24).map((v) => Number(v.toFixed(4))),
    source: "eod" as const,
  };
}

async function loadYahooDailyChange(symbolCandidates: string[]): Promise<{ symbol: string; dayChangePct: number | null; latest: number | null } | null> {
  for (const symbol of symbolCandidates) {
    try {
      const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=7d`;
      const payload = await fetchJson<any>(url);
      const result = Array.isArray(payload?.chart?.result) ? payload.chart.result[0] : null;
      const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
      const values = closes
        .map((value: unknown) => parseFloatSafe(value))
        .filter((value: number | null): value is number => value != null);
      if (values.length < 2) continue;
      const latest = values[values.length - 1];
      const prev = values[values.length - 2];
      const dayChangePct = prev && prev !== 0 ? Number((((latest - prev) / prev) * 100).toFixed(4)) : null;
      return { symbol, dayChangePct, latest };
    } catch {
      // fall through to next candidate
    }
  }
  return null;
}

function fallbackRows(): GlobalIndexRow[] {
  const seed = {
    SPX: { value: 5200, day: 0.35 },
    IXIC: { value: 16750, day: 0.48 },
    DJI: { value: 39200, day: 0.22 },
    DAX: { value: 18950, day: -0.14 },
    CAC40: { value: 7940, day: -0.08 },
    STOXX50E: { value: 5010, day: -0.11 },
    MXEF: { value: 1035, day: 0.05 },
    BVSP: { value: 128400, day: -0.42 },
    MERV: { value: 1780000, day: 0.39 },
  } as Record<string, { value: number; day: number }>;
  return GLOBAL_INDEX_DEFS.map((def) => ({
    symbol: def.symbol,
    name: def.name,
    region: def.region,
    value: seed[def.symbol]?.value ?? null,
    dayChangePct: seed[def.symbol]?.day ?? null,
    provider: "fallback",
    source: "fallback",
    series: [],
    status: "INDICATIVE" as const,
    note: "Fallback baseline used (provider unavailable)",
  }));
}

function avg(values: Array<number | null | undefined>) {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
}

function buildRiskOnOff(rows: GlobalIndexRow[], crossAsset: { btc: number | null; gold: number | null; oil: number | null; dxy: number | null }) {
  const by = Object.fromEntries(rows.map((row) => [row.symbol, row]));
  const us = avg([by.SPX?.dayChangePct, by.IXIC?.dayChangePct, by.DJI?.dayChangePct]);
  const eu = avg([by.DAX?.dayChangePct, by.CAC40?.dayChangePct, by.STOXX50E?.dayChangePct]);
  const em = avg([by.MXEF?.dayChangePct, by.BVSP?.dayChangePct, by.MERV?.dayChangePct]);
  const btc = crossAsset.btc;
  const gold = crossAsset.gold;
  const oil = crossAsset.oil;
  const dxy = crossAsset.dxy;
  const matrix = [
    { label: "US Equities", value: us },
    { label: "EU Equities", value: eu },
    { label: "EM Equities", value: em },
    { label: "BTC", value: btc },
    { label: "Gold", value: gold },
    { label: "Oil", value: oil },
    { label: "DXY", value: dxy },
  ];
  let score = 0;
  matrix.forEach((row) => {
    if (row.value == null) return;
    if (row.label === "Gold" || row.label === "DXY") {
      score += row.value < 0 ? 1 : -1;
    } else {
      score += row.value > 0 ? 1 : -1;
    }
  });
  const normalized = Number(((score / matrix.length) * 100).toFixed(2));
  const regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF" =
    normalized > 20 ? "RISK_ON" : normalized < -20 ? "RISK_OFF" : "NEUTRAL";
  return {
    regime,
    score: Number.isFinite(normalized) ? normalized : null,
    matrix,
    note: "Composite from US/EU/EM equities plus BTC/Gold/Oil/DXY directional matrix",
  };
}

export async function getGlobalIndicesSnapshot(forceRefresh = false): Promise<GlobalIndicesPayload> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.tsMs < CACHE_TTL_MS) {
    return { ...cache.payload, cacheHit: true };
  }

  let providerMode: "twelvedata" | "fallback" = "fallback";
  let rows: GlobalIndexRow[] = [];
  if (TWELVEDATA_API_KEY) {
    const loaded = await Promise.all(
      GLOBAL_INDEX_DEFS.map(async (def) => {
        try {
          const data = await loadTwelveDataSeries(def.providerSymbol);
          if (!data) {
            return {
              symbol: def.symbol,
              name: def.name,
              region: def.region,
              value: null,
              dayChangePct: null,
              provider: def.provider,
              source: "eod" as const,
              series: [],
              status: "CONSTRAINED" as const,
            };
          }
          return {
            symbol: def.symbol,
            name: def.name,
            region: def.region,
            value: data.value,
            dayChangePct: data.dayChangePct,
            provider: def.provider,
            source: data.source,
            series: data.series,
            status: "REFRESH" as const,
          };
        } catch (error: any) {
          return {
            symbol: def.symbol,
            name: def.name,
            region: def.region,
            value: null,
            dayChangePct: null,
            provider: def.provider,
            source: "eod" as const,
            series: [],
            status: "CONSTRAINED" as const,
            note: String(error?.message || "provider_fetch_failed"),
          };
        }
      }),
    );
    const fresh = loaded.filter((row) => row.status === "REFRESH").length;
    if (fresh >= 5) {
      providerMode = "twelvedata";
      rows = loaded;
    } else {
      rows = fallbackRows();
    }
  } else {
    rows = fallbackRows();
  }

  const binance = await getBinanceMarketSnapshot(false).catch(() => null);
  const [oilSnapshot, dxySnapshot] = await Promise.all([
    loadYahooDailyChange(["CL=F", "BZ=F"]),
    loadYahooDailyChange(["DX-Y.NYB", "DXY", "DX=F"]),
  ]);
  const btc = binance?.rows.find((row) => row.symbol === "BTCUSDT")?.priceChange24hPct ?? null;
  const gold = binance?.rows.find((row) => row.symbol === "PAXGUSDT")?.priceChange24hPct ?? null;
  const oil = oilSnapshot?.dayChangePct ?? null;
  const dxy = dxySnapshot?.dayChangePct ?? null;
  const crossAsset = {
    btc,
    gold,
    oil,
    dxy,
    note: `BTC/Gold from Binance; Oil ${oilSnapshot?.symbol || "n/a"} and DXY ${dxySnapshot?.symbol || "n/a"} from Yahoo chart`,
  };

  const riskOnOff = buildRiskOnOff(rows, crossAsset);
  const status: GlobalIndexStatus =
    rows.filter((row) => row.status === "REFRESH").length >= 6
      ? "REFRESH"
      : rows.some((row) => row.status !== "CONSTRAINED")
        ? "INDICATIVE"
        : "CONSTRAINED";

  const payload: GlobalIndicesPayload = {
    generatedAt: new Date(now).toISOString(),
    cacheHit: false,
    status,
    providerMode,
    rows,
    riskOnOff,
    crossAsset,
  };
  cache = { tsMs: now, payload };
  return payload;
}
