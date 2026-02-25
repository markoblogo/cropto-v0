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
export const ENABLE_DBNOMICS_WIDGETS = envBool("ENABLE_DBNOMICS_WIDGETS", true);
export const ENABLE_DBNOMICS_SPOT_PROVIDER = envBool("ENABLE_DBNOMICS_SPOT_PROVIDER", ENABLE_DBNOMICS_WIDGETS);
export const ENABLE_FAO_FFPI_WIDGETS = envBool("ENABLE_FAO_FFPI_WIDGETS", true);
export const ENABLE_FAO_FFPI_PROVIDER = envBool("ENABLE_FAO_FFPI_PROVIDER", ENABLE_FAO_FFPI_WIDGETS);
export const ENABLE_USDA_MARS_REPORTS_WIDGET = envBool("ENABLE_USDA_MARS_REPORTS_WIDGET", true);
export const ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET = envBool("ENABLE_US_CASH_EXPORT_CONTEXT_WIDGET", true);
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
export const DBNOMICS_API_BASE_URL =
  process.env.DBNOMICS_API_BASE_URL ||
  process.env.DBNOMICS_BASE_URL ||
  "https://api.db.nomics.world/v22";
export const DBNOMICS_TIMEOUT_MS = envNum("DBNOMICS_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const DBNOMICS_SPOT_SERIES_MAP =
  process.env.DBNOMICS_SPOT_SERIES_MAP ||
  JSON.stringify({
    wheat: "FWHEAT_US_HRW.1W",
    corn: "FMAIZE.1W",
    soybeans: "FSOYBEANS.1W",
    rapeseed: "FRAPESEED_OIL.1W",
  });

export const APIFARMER_API_URL = process.env.APIFARMER_API_URL || "";
export const APIFARMER_API_KEY = process.env.APIFARMER_API_KEY || "";
export const APIFARMER_SOURCE_URL =
  process.env.APIFARMER_SOURCE_URL ||
  "https://apifarmer.com/";
export const APIFARMER_TIMEOUT_MS = envNum("APIFARMER_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const FAO_FFPI_URL =
  process.env.FAO_FFPI_URL ||
  process.env.FAO_FFPI_SOURCE_URL ||
  "https://www.fao.org/media/docs/worldfoodsituationlibraries/default-document-library/food_price_indices_data_csv_feb.csv?download=true";
export const FAO_FFPI_PAGE_URL =
  process.env.FAO_FFPI_PAGE_URL ||
  "https://www.fao.org/worldfoodsituation/foodpricesindex/en/";
export const FAO_FFPI_TIMEOUT_MS = envNum("FAO_FFPI_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const FAO_FFPI_PARSER_MODE = (process.env.FAO_FFPI_PARSER_MODE || "auto").toLowerCase() === "csv" ? "csv" : "auto";
export const USDA_FAS_PSD_API_URL = process.env.USDA_FAS_PSD_API_URL || "";
export const USDA_FAS_PSD_API_KEY = process.env.USDA_FAS_PSD_API_KEY || "";
export const USDA_MARS_BASE_URL = process.env.USDA_MARS_BASE_URL || "https://marsapi.ams.usda.gov/services/v3.1/public";
export const USDA_MARS_PUBLISHED_LIST_PATHS = (
  process.env.USDA_MARS_PUBLISHED_LIST_PATHS ||
  "listPublishedReports?format=json,reports/listPublishedReports?format=json"
)
  .split(",")
  .map((value) => value.trim().replace(/^\/+/, ""))
  .filter(Boolean);
export const USDA_MARS_REPORTS_LIMIT = envNum("USDA_MARS_REPORTS_LIMIT", 50);
export const USDA_MARS_GRAIN_WIDGET_LIMIT = envNum("USDA_MARS_GRAIN_WIDGET_LIMIT", 6);
export const USDA_MARS_TIMEOUT_MS = envNum("USDA_MARS_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const USDA_MARS_MAX_REPORTS_SCAN = envNum("USDA_MARS_MAX_REPORTS_SCAN", 200);
export const US_CASH_EXPORT_CONTEXT_TOP_N = envNum("US_CASH_EXPORT_CONTEXT_TOP_N", 3);
export const US_CASH_EXPORT_CONTEXT_MAX_REPORTS_SCAN = envNum("US_CASH_EXPORT_CONTEXT_MAX_REPORTS_SCAN", USDA_MARS_MAX_REPORTS_SCAN);
export const USDA_MARS_INCLUDE_KEYWORDS = (
  process.env.USDA_MARS_INCLUDE_KEYWORDS ||
  "grain,bid,bids,export,market rates,corn,wheat,soy,soybean,oilseed,portland,louisiana,texas"
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
export const USDA_MARS_EXCLUDE_KEYWORDS = (
  process.env.USDA_MARS_EXCLUDE_KEYWORDS ||
  "livestock,poultry,dairy,eggs,hay"
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

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
