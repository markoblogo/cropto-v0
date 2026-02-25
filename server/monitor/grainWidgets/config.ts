function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function envNum(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) ? raw : fallback;
}

export const ENABLE_GRAIN_WIDGETS_EXPANSION = envBool("ENABLE_GRAIN_WIDGETS_EXPANSION", true);
export const ENABLE_BARCHART_CASH_WIDGETS = envBool("ENABLE_BARCHART_CASH_WIDGETS", true);
export const ENABLE_COMMODITIC_WIDGETS = envBool("ENABLE_COMMODITIC_WIDGETS", true);
export const ENABLE_APIFARMER_WIDGETS = envBool("ENABLE_APIFARMER_WIDGETS", true);
export const ENABLE_TRADINGCHARTS_FUTURES_WIDGETS = envBool("ENABLE_TRADINGCHARTS_FUTURES_WIDGETS", true);
export const ENABLE_LIVESTOCK_FEED_WIDGETS = envBool("ENABLE_LIVESTOCK_FEED_WIDGETS", true);
export const ENABLE_MACRO_AGRI_INDICES_WIDGETS = envBool("ENABLE_MACRO_AGRI_INDICES_WIDGETS", true);
export const ENABLE_TRADINGECONOMICS_API = envBool("ENABLE_TRADINGECONOMICS_API", true);
export const ENABLE_TRADINGECONOMICS_EMBED = envBool("ENABLE_TRADINGECONOMICS_EMBED", true);
export const ENABLE_GRAIN_WIDGETS_MOCK_FALLBACK = envBool("ENABLE_GRAIN_WIDGETS_MOCK_FALLBACK", true);
export const BARCHART_ALLOW_NO_KEY = envBool("BARCHART_ALLOW_NO_KEY", true);

export const GRAIN_WIDGETS_REFRESH_MS = envNum("GRAIN_WIDGETS_REFRESH_MS", 15 * 60 * 1000);
export const GRAIN_WIDGETS_CACHE_TTL_MS = envNum("GRAIN_WIDGETS_CACHE_TTL_MS", 20 * 60 * 1000);
export const GRAIN_WIDGETS_FETCH_TIMEOUT_MS = envNum("GRAIN_WIDGETS_FETCH_TIMEOUT_MS", 7000);
export const GRAIN_WIDGETS_SERIES_POINTS = envNum("GRAIN_WIDGETS_SERIES_POINTS", 7);
export const GRAIN_WIDGETS_TIMEFRAME_DEFAULT =
  process.env.GRAIN_WIDGETS_TIMEFRAME_DEFAULT === "7d" ? "7d" : "1d";

export const BARCHART_API_KEY = process.env.BARCHART_API_KEY || "";
export const BARCHART_CASH_URL =
  process.env.BARCHART_QUOTES_URL ||
  process.env.BARCHART_CASH_URL ||
  "https://ondemand.websol.barchart.com/getQuote.json";
export const BARCHART_CASH_SYMBOLS = process.env.BARCHART_CASH_SYMBOLS || "ZC*1,ZW*1,ZS*1";
export const BARCHART_TIMEOUT_MS = envNum("BARCHART_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);

export const COMMODITIC_API_URL = process.env.COMMODITIC_API_URL || "";
export const COMMODITIC_API_KEY = process.env.COMMODITIC_API_KEY || "";
export const COMMODITIC_SOURCE_URL =
  process.env.COMMODITIC_SOURCE_URL ||
  "https://www.commoditic.com/";
export const COMMODITIC_TIMEOUT_MS = envNum("COMMODITIC_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);

export const APIFARMER_API_URL = process.env.APIFARMER_API_URL || "";
export const APIFARMER_API_KEY = process.env.APIFARMER_API_KEY || "";
export const APIFARMER_SOURCE_URL =
  process.env.APIFARMER_SOURCE_URL ||
  "https://apifarmer.com/";
export const APIFARMER_TIMEOUT_MS = envNum("APIFARMER_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);

export const TRADINGCHARTS_CBOT_URL =
  process.env.TRADINGCHARTS_CBOT_URL ||
  "https://futures.tradingcharts.com/marketquotes/CBOT.html";
export const TRADINGCHARTS_CBOT_URLS = (
  process.env.TRADINGCHARTS_CBOT_URLS ||
  `${TRADINGCHARTS_CBOT_URL},https://www.tradingcharts.com/marketquotes/CBOT.html,https://www.tradingcharts.com/quotes/futures.html`
)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
export const TRADINGCHARTS_FETCH_TIMEOUT_MS = envNum("TRADINGCHARTS_FETCH_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const TRADINGCHARTS_USER_AGENT =
  process.env.TRADINGCHARTS_USER_AGENT || "CroptoMonitor/1.1 (+https://cropto.abvx.xyz)";

export const COMMODITIC_LIVESTOCK_API_URL = process.env.COMMODITIC_LIVESTOCK_API_URL || "";
export const COMMODITIC_LIVESTOCK_SOURCE_URL =
  process.env.COMMODITIC_LIVESTOCK_SOURCE_URL ||
  COMMODITIC_SOURCE_URL;

export const TRADINGECONOMICS_API_URL = process.env.TRADINGECONOMICS_API_URL || "";
export const TRADINGECONOMICS_API_KEY = process.env.TRADINGECONOMICS_API_KEY || "";
export const TRADINGECONOMICS_SOURCE_URL =
  process.env.TRADINGECONOMICS_SOURCE_URL ||
  "https://tradingeconomics.com/commodities";
export const TRADINGECONOMICS_EMBED_URL =
  process.env.TRADINGECONOMICS_EMBED_URL ||
  "https://api.tradingeconomics.com/embed/?s=commodity";
