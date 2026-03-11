import { fetchWithHeaders } from "./grainWidgets/providers/utils";

const BINANCE_SPOT_BASE_URL = process.env.BINANCE_SPOT_BASE_URL || "https://api.binance.com";
const BINANCE_OPTIONS_BASE_URL = process.env.BINANCE_OPTIONS_BASE_URL || "https://eapi.binance.com";
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.MONITOR_BINANCE_FETCH_TIMEOUT_MS || "7000", 10);
const CACHE_TTL_MS = Number.parseInt(process.env.MONITOR_BINANCE_CACHE_TTL_MS || String(2 * 60 * 1000), 10);

const START_SYMBOLS = ["PAXGUSDT", "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"] as const;
type SymbolCode = (typeof START_SYMBOLS)[number];

export type BinanceAssetType = "crypto_spot" | "token_commodity" | "options_agg";
export type BinanceRowStatus = "REFRESH" | "INDICATIVE" | "CONSTRAINED";

export type BinanceMarketRow = {
  symbol: string;
  assetType: BinanceAssetType;
  underlying: string;
  price: number | null;
  priceChange24hPct: number | null;
  volume24h: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  source: string;
  status: BinanceRowStatus;
  series?: number[];
  extra?: Record<string, unknown>;
};

export type BinanceSnapshotPayload = {
  generatedAt: string;
  cacheHit: boolean;
  status: BinanceRowStatus;
  rows: BinanceMarketRow[];
  macroRisk: {
    score: number | null;
    btcVolProxy: number | null;
    ethVolProxy: number | null;
    note: string;
  };
};

let cache: { tsMs: number; payload: BinanceSnapshotPayload } | null = null;

function parseFloatSafe(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function toSeries(points: Array<{ close: number }>, limit = 24): number[] {
  return points.slice(-limit).map((point) => Number(point.close.toFixed(6)));
}

function rowStatus(rows: BinanceMarketRow[]): BinanceRowStatus {
  const refreshCount = rows.filter((row) => row.status === "REFRESH").length;
  if (refreshCount >= 5) return "REFRESH";
  if (rows.some((row) => row.status !== "CONSTRAINED")) return "INDICATIVE";
  return "CONSTRAINED";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithHeaders(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retryOnStatuses: [429, 500, 502, 503, 504],
    headers: {
      accept: "application/json",
      "user-agent": "CroptoMonitor/binance-market-service",
    },
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`invalid_json:${url}`);
  }
}

async function loadTicker24h(symbol: SymbolCode) {
  const url = `${BINANCE_SPOT_BASE_URL}/api/v3/ticker/24hr?symbol=${symbol}`;
  const payload = await fetchJson<any>(url);
  const lastPrice = parseFloatSafe(payload?.lastPrice);
  const priceChange24hPct = parseFloatSafe(payload?.priceChangePercent);
  const volume24h = parseFloatSafe(payload?.quoteVolume);
  return {
    lastPrice,
    priceChange24hPct,
    volume24h,
    extra: {
      high24h: parseFloatSafe(payload?.highPrice),
      low24h: parseFloatSafe(payload?.lowPrice),
      volumeBase: parseFloatSafe(payload?.volume),
      count: parseFloatSafe(payload?.count),
    },
  };
}

async function loadKlines(symbol: SymbolCode, interval = "1h", limit = 48) {
  const url = `${BINANCE_SPOT_BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const payload = await fetchJson<any[]>(url);
  return (payload || [])
    .map((row) => ({
      openTime: Number(row?.[0] || 0),
      close: parseFloatSafe(row?.[4]) ?? 0,
    }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0);
}

async function loadOptionsOpenInterest(underlying: "BTCUSDT" | "ETHUSDT", optionSymbolHint?: string): Promise<number | null> {
  const underlyingAsset = underlying.replace("USDT", "");
  const candidates = [
    `${BINANCE_OPTIONS_BASE_URL}/eapi/v1/openInterest?underlyingAsset=${underlyingAsset}`,
    `${BINANCE_OPTIONS_BASE_URL}/eapi/v1/openInterest?underlying=${underlying}`,
    optionSymbolHint ? `${BINANCE_OPTIONS_BASE_URL}/eapi/v1/openInterest?symbol=${encodeURIComponent(optionSymbolHint)}` : "",
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const payload = await fetchJson<any>(url);
      if (Array.isArray(payload)) {
        const oi = payload
          .map((item) => parseFloatSafe(item?.sumOpenInterest ?? item?.openInterest ?? item?.openInterestUsd ?? item?.openInterestValue))
          .filter((v): v is number => typeof v === "number")
          .reduce((acc, v) => acc + v, 0);
        if (oi > 0) return Number(oi.toFixed(4));
      } else if (payload && typeof payload === "object") {
        const oi = parseFloatSafe(payload?.sumOpenInterest ?? payload?.openInterest ?? payload?.openInterestUsd ?? payload?.openInterestValue);
        if (oi != null && oi > 0) return Number(oi.toFixed(4));
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function loadOptionsAggregate(underlying: "BTCUSDT" | "ETHUSDT") {
  const [tickerRowsRaw, markRowsRaw] = await Promise.all([
    fetchJson<any[]>(`${BINANCE_OPTIONS_BASE_URL}/eapi/v1/ticker?underlying=${underlying}`),
    fetchJson<any[]>(`${BINANCE_OPTIONS_BASE_URL}/eapi/v1/mark?underlying=${underlying}`),
  ]);

  const tickerRows = Array.isArray(tickerRowsRaw) ? tickerRowsRaw : [];
  const markRows = Array.isArray(markRowsRaw) ? markRowsRaw : [];
  const tickerBySymbol = new Map<string, any>(tickerRows.map((row) => [String(row?.symbol || ""), row]));
  const markBySymbol = new Map<string, any>(markRows.map((row) => [String(row?.symbol || ""), row]));
  const unionSymbols = new Set<string>([...tickerBySymbol.keys(), ...markBySymbol.keys()].filter(Boolean));

  let volume24h = 0;
  let weightedIvNumerator = 0;
  let weightedIvDenominator = 0;
  let weightedPctNumerator = 0;
  let weightedPctDenominator = 0;

  for (const symbol of unionSymbols) {
    const ticker = tickerBySymbol.get(symbol);
    const mark = markBySymbol.get(symbol);
    const amount = parseFloatSafe(ticker?.amount) ?? parseFloatSafe(ticker?.volume) ?? 0;
    const markIv = parseFloatSafe(mark?.markIV);
    const pct = parseFloatSafe(ticker?.priceChangePercent);
    if (amount > 0) {
      volume24h += amount;
      if (markIv != null) {
        weightedIvNumerator += markIv * amount;
        weightedIvDenominator += amount;
      }
      if (pct != null) {
        weightedPctNumerator += pct * amount;
        weightedPctDenominator += amount;
      }
    }
  }

  const impliedVolatility =
    weightedIvDenominator > 0
      ? Number((weightedIvNumerator / weightedIvDenominator).toFixed(6))
      : null;
  const priceChange24hPct =
    weightedPctDenominator > 0
      ? Number((weightedPctNumerator / weightedPctDenominator).toFixed(6))
      : null;
  const openInterest = await loadOptionsOpenInterest(underlying, unionSymbols.values().next().value);

  return {
    impliedVolatility,
    priceChange24hPct,
    volume24h: volume24h > 0 ? Number(volume24h.toFixed(4)) : null,
    openInterest,
    contractsCount: unionSymbols.size,
    markRows: markRows.length,
    tickerRows: tickerRows.length,
  };
}

function buildMacroRisk(rows: BinanceMarketRow[]) {
  const btcSpot = rows.find((row) => row.symbol === "BTCUSDT");
  const ethSpot = rows.find((row) => row.symbol === "ETHUSDT");
  const btcOpt = rows.find((row) => row.symbol === "BTC_OPTIONS");
  const ethOpt = rows.find((row) => row.symbol === "ETH_OPTIONS");
  const paxg = rows.find((row) => row.symbol === "PAXGUSDT");

  const btcVol = btcOpt?.impliedVolatility ?? null;
  const ethVol = ethOpt?.impliedVolatility ?? null;
  const volAvg = [btcVol, ethVol].filter((v): v is number => typeof v === "number");
  const volScore = volAvg.length ? Math.min(1, Math.max(0, volAvg.reduce((a, b) => a + b, 0) / volAvg.length / 1.2)) : 0.5;
  const momentumSource = [btcSpot?.priceChange24hPct, ethSpot?.priceChange24hPct].filter((v): v is number => typeof v === "number");
  const momentum = momentumSource.length ? momentumSource.reduce((a, b) => a + Math.abs(b), 0) / momentumSource.length : 0;
  const momentumScore = Math.min(1, Math.max(0, momentum / 8));
  const hedgePenalty = typeof paxg?.priceChange24hPct === "number" && paxg.priceChange24hPct > 0 ? 0.1 : 0.25;
  const score = Number((100 * (0.5 * volScore + 0.4 * momentumScore + 0.1 * hedgePenalty)).toFixed(2));

  return {
    score: Number.isFinite(score) ? score : null,
    btcVolProxy: btcVol,
    ethVolProxy: ethVol,
    note: "Macro risk from Binance options IV + majors momentum + PAXG hedge signal",
  };
}

export async function getBinanceMarketSnapshot(forceRefresh = false): Promise<BinanceSnapshotPayload> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.tsMs < CACHE_TTL_MS) {
    return { ...cache.payload, cacheHit: true };
  }

  const rows: BinanceMarketRow[] = [];

  await Promise.all(
    START_SYMBOLS.map(async (symbol) => {
      const assetType: BinanceAssetType = symbol === "PAXGUSDT" ? "token_commodity" : "crypto_spot";
      try {
        const [ticker, klines] = await Promise.all([loadTicker24h(symbol), loadKlines(symbol)]);
        rows.push({
          symbol,
          assetType,
          underlying: symbol.replace("USDT", ""),
          price: ticker.lastPrice,
          priceChange24hPct: ticker.priceChange24hPct,
          volume24h: ticker.volume24h,
          openInterest: null,
          impliedVolatility: null,
          source: "binance_spot_rest",
          status: ticker.lastPrice != null ? "REFRESH" : "INDICATIVE",
          series: toSeries(klines),
          extra: ticker.extra,
        });
      } catch (error: any) {
        rows.push({
          symbol,
          assetType,
          underlying: symbol.replace("USDT", ""),
          price: null,
          priceChange24hPct: null,
          volume24h: null,
          openInterest: null,
          impliedVolatility: null,
          source: "binance_spot_rest",
          status: "CONSTRAINED",
          extra: { error: String(error?.message || "fetch_failed") },
        });
      }
    }),
  );

  try {
    const btc = await loadOptionsAggregate("BTCUSDT");
    rows.push({
      symbol: "BTC_OPTIONS",
      assetType: "options_agg",
      underlying: "BTC",
      price: null,
      priceChange24hPct: btc.priceChange24hPct,
      volume24h: btc.volume24h,
      openInterest: btc.openInterest,
      impliedVolatility: btc.impliedVolatility,
      source: "binance_options_api",
      status: btc.impliedVolatility != null ? "REFRESH" : "INDICATIVE",
      extra: {
        contractsCount: btc.contractsCount,
        tickerRows: btc.tickerRows,
        markRows: btc.markRows,
        openInterestMode: btc.openInterest != null ? "direct" : "unavailable",
      },
    });
  } catch (error: any) {
    rows.push({
      symbol: "BTC_OPTIONS",
      assetType: "options_agg",
      underlying: "BTC",
      price: null,
      priceChange24hPct: null,
      volume24h: null,
      openInterest: null,
      impliedVolatility: null,
      source: "binance_options_api",
      status: "CONSTRAINED",
      extra: { error: String(error?.message || "options_fetch_failed") },
    });
  }

  try {
    const eth = await loadOptionsAggregate("ETHUSDT");
    rows.push({
      symbol: "ETH_OPTIONS",
      assetType: "options_agg",
      underlying: "ETH",
      price: null,
      priceChange24hPct: eth.priceChange24hPct,
      volume24h: eth.volume24h,
      openInterest: eth.openInterest,
      impliedVolatility: eth.impliedVolatility,
      source: "binance_options_api",
      status: eth.impliedVolatility != null ? "REFRESH" : "INDICATIVE",
      extra: {
        contractsCount: eth.contractsCount,
        tickerRows: eth.tickerRows,
        markRows: eth.markRows,
        openInterestMode: eth.openInterest != null ? "direct" : "unavailable",
      },
    });
  } catch (error: any) {
    rows.push({
      symbol: "ETH_OPTIONS",
      assetType: "options_agg",
      underlying: "ETH",
      price: null,
      priceChange24hPct: null,
      volume24h: null,
      openInterest: null,
      impliedVolatility: null,
      source: "binance_options_api",
      status: "CONSTRAINED",
      extra: { error: String(error?.message || "options_fetch_failed") },
    });
  }

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const payload: BinanceSnapshotPayload = {
    generatedAt: new Date(now).toISOString(),
    cacheHit: false,
    status: rowStatus(rows),
    rows,
    macroRisk: buildMacroRisk(rows),
  };
  cache = { tsMs: now, payload };
  return payload;
}
