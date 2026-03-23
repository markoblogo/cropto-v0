function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function envNum(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) ? raw : fallback;
}

export const ENABLE_GRAIN_MARKETS_CORE = envBool("ENABLE_GRAIN_MARKETS_CORE", true);
export const ENABLE_CBOT_BARCHART = envBool("ENABLE_CBOT_BARCHART", true);
export const ENABLE_CBOT_TRADINGCHARTS_FALLBACK = envBool("ENABLE_CBOT_TRADINGCHARTS_FALLBACK", true);
export const ENABLE_EURONEXT_WEB = envBool("ENABLE_EURONEXT_WEB", true);
export const ENABLE_GRAIN_MARKETS_MOCK_FALLBACK = envBool("ENABLE_GRAIN_MARKETS_MOCK_FALLBACK", true);

export const GRAIN_MARKETS_REFRESH_MS = envNum("GRAIN_MARKETS_REFRESH_MS", 15 * 60 * 1000);
export const GRAIN_MARKETS_CACHE_TTL_MS = envNum("GRAIN_MARKETS_CACHE_TTL_MS", 20 * 60 * 1000);
export const GRAIN_MARKETS_FETCH_TIMEOUT_MS = envNum("GRAIN_MARKETS_FETCH_TIMEOUT_MS", 8000);
export const GRAIN_MARKETS_SERIES_POINTS = envNum("GRAIN_MARKETS_SERIES_POINTS", 12);
export const GRAIN_MARKETS_TIMEFRAME_DEFAULT =
  process.env.GRAIN_MARKETS_TIMEFRAME_DEFAULT === "7d" ? "7d" : "1d";

export const BARCHART_API_KEY = process.env.BARCHART_API_KEY || "";
export const BARCHART_QUOTES_URL =
  process.env.BARCHART_QUOTES_URL ||
  "https://ondemand.websol.barchart.com/getQuote.json";
export const BARCHART_CBOT_SYMBOLS = process.env.BARCHART_CBOT_SYMBOLS || "ZC*1,ZW*1,ZS*1";

export const TRADINGCHARTS_CBOT_URL =
  process.env.TRADINGCHARTS_CBOT_URL ||
  "https://futures.tradingcharts.com/marketquotes/CBOT.html";

export const EURONEXT_WEBSERVICES_URL =
  process.env.EURONEXT_WEBSERVICES_URL ||
  "";

export const EURONEXT_SOURCE_URL =
  process.env.EURONEXT_SOURCE_URL ||
  "https://live.euronext.com/en/markets/commodities";
