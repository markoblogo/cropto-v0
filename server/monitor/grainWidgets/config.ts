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
export const ENABLE_USDA_MARS_DAILY_TXT = envBool("ENABLE_USDA_MARS_DAILY_TXT", true);
export const ENABLE_USDA_GTR_LOGISTICS_WIDGET = envBool("ENABLE_USDA_GTR_LOGISTICS_WIDGET", true);
export const ENABLE_FAOSTAT_PP_WIDGET = envBool("ENABLE_FAOSTAT_PP_WIDGET", true);
export const ENABLE_FPMA_MARKET_PRICES_WIDGET = envBool("ENABLE_FPMA_MARKET_PRICES_WIDGET", true);
export const ENABLE_COUNTRY_MULTI_WIDGET_MOCK = envBool(
  "ENABLE_COUNTRY_MULTI_WIDGET_MOCK",
  process.env.NODE_ENV !== "production",
);
export const ENABLE_ALPHAVANTAGE_PROVIDER = envBool("ENABLE_ALPHAVANTAGE_PROVIDER", true);
export const ENABLE_NASDAQ_DATALINK_PROVIDER = envBool("ENABLE_NASDAQ_DATALINK_PROVIDER", true);
export const ENABLE_NASDAQ_CHRIS = envBool("ENABLE_NASDAQ_CHRIS", false);
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
export const USDA_MARS_DAILY_REPORT_ID = envNum("USDA_MARS_DAILY_REPORT_ID", 3420);
export const USDA_MARS_MNREPORTS_BASE_URL =
  process.env.USDA_MARS_MNREPORTS_BASE_URL ||
  "https://www.ams.usda.gov/mnreports";
export const USDA_MARS_FILE_URL_TEMPLATES = (
  process.env.USDA_MARS_FILE_URL_TEMPLATES ||
  "https://www.ams.usda.gov/mnreports/{fileName}.{ext},https://marsapi.ams.usda.gov/marsapi/reports/{fileName}.txt,https://marsapi.ams.usda.gov/services/v3.1/public/reports/{fileName}.txt"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const USDA_MARS_DAILY_MAX_ROWS = envNum("USDA_MARS_DAILY_MAX_ROWS", 8);
export const USDA_GTR_BASE_URL =
  process.env.USDA_GTR_BASE_URL ||
  "https://www.ams.usda.gov/sites/default/files/media";
export const USDA_GTR_DATASET_URLS = (
  process.env.USDA_GTR_DATASET_URLS ||
  `${USDA_GTR_BASE_URL}/GTRTable7.csv,${USDA_GTR_BASE_URL}/GTRTable8.csv`
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const USDA_GTR_TIMEOUT_MS = envNum("USDA_GTR_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const USDA_GTR_CACHE_TTL_MS = envNum("USDA_GTR_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const USDA_GTR_MAX_SIGNALS = envNum("USDA_GTR_MAX_SIGNALS", 4);
export const FAOSTAT_BASE_URL =
  process.env.FAOSTAT_BASE_URL ||
  "https://fenixservices.fao.org/faostat/api/v1/en";
export const FAOSTAT_DATASOURCE = process.env.FAOSTAT_DATASOURCE || "production";
export const FAOSTAT_TIMEOUT_MS = envNum("FAOSTAT_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const FAOSTAT_CACHE_TTL_MS = envNum("FAOSTAT_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const FAOSTAT_DISCOVERY_TTL_MS = envNum("FAOSTAT_DISCOVERY_TTL_MS", 7 * 24 * 60 * 60 * 1000);
export const FAOSTAT_MAX_YEARS = envNum("FAOSTAT_MAX_YEARS", 5);
export const FPMA_API_BASE_URL =
  process.env.FPMA_API_BASE_URL ||
  "https://fpma.fao.org/giews/fpmat4/api";
export const FPMA_DATA_PATHS = (
  process.env.FPMA_DATA_PATHS ||
  "prices,PriceQuotation,v1/prices,v1/PriceQuotation"
)
  .split(",")
  .map((value) => value.trim().replace(/^\/+/, ""))
  .filter(Boolean);
export const FPMA_TIMEOUT_MS = envNum("FPMA_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const FPMA_CACHE_TTL_MS = envNum("FPMA_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const FPMA_MAX_POINTS = envNum("FPMA_MAX_POINTS", 12);
export const FPMA_DEFAULT_PRICE_TYPE = (process.env.FPMA_DEFAULT_PRICE_TYPE || "WHOLESALE").toUpperCase() === "RETAIL"
  ? "RETAIL"
  : "WHOLESALE";
export const FPMA_SUPPORTED_PRICE_TYPES = (
  process.env.FPMA_SUPPORTED_PRICE_TYPES ||
  "WHOLESALE,RETAIL"
)
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter((value): value is "WHOLESALE" | "RETAIL" => value === "WHOLESALE" || value === "RETAIL");
export const FPMA_EU_PROXY_COUNTRIES = (
  process.env.FPMA_EU_PROXY_COUNTRIES ||
  "FR,DE,PL,RO,ES"
)
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const FPMA_CROP_MAP =
  process.env.FPMA_CROP_MAP ||
  JSON.stringify({
    WHEAT: ["wheat"],
    MAIZE: ["maize", "corn"],
    SOY: ["soybean", "soybeans", "soy"],
    RAPESEED: ["rapeseed", "canola"],
    SUNFLOWER: ["sunflower", "sunflower seed"],
  });
export const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || "";
export const ALPHAVANTAGE_BASE_URL =
  process.env.ALPHAVANTAGE_BASE_URL ||
  "https://www.alphavantage.co/query";
export const ALPHAVANTAGE_TIMEOUT_MS = envNum("ALPHAVANTAGE_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const ALPHAVANTAGE_CACHE_TTL_MS = envNum("ALPHAVANTAGE_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const ALPHAVANTAGE_INTERVAL = (process.env.ALPHAVANTAGE_INTERVAL || "monthly").trim() || "monthly";
export const ALPHAVANTAGE_FUNCTIONS = (process.env.ALPHAVANTAGE_FUNCTIONS || "WHEAT,CORN")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const ALPHAVANTAGE_UNIT_MAP = process.env.ALPHAVANTAGE_UNIT_MAP || "";
export const ALPHAVANTAGE_RATE_LIMIT_PER_MIN = envNum("ALPHAVANTAGE_RATE_LIMIT_PER_MIN", 5);
export const ALPHAVANTAGE_BACKOFF_MS = envNum("ALPHAVANTAGE_BACKOFF_MS", 60_000);
export const NASDAQ_API_KEY = process.env.NASDAQ_API_KEY || "";
export const NASDAQ_BASE_URL =
  process.env.NASDAQ_BASE_URL ||
  "https://data.nasdaq.com/api/v3";
export const NASDAQ_TIMEOUT_MS = envNum("NASDAQ_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const NASDAQ_CACHE_TTL_MS = envNum("NASDAQ_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const NASDAQ_DATASETS = (
  process.env.NASDAQ_DATASETS ||
  "FRED/DGS10,FRED/DGS2,FRED/DTWEXBGS,FRED/T10Y2Y"
)
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const NASDAQ_CHRIS_DATASETS = (process.env.NASDAQ_CHRIS_DATASETS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const NASDAQ_UNIT_MAP = process.env.NASDAQ_UNIT_MAP || "";
export const NASDAQ_SERIES_COLUMN_MAP = process.env.NASDAQ_SERIES_COLUMN_MAP || "";
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
