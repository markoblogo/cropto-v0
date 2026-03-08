function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function envNum(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) ? raw : fallback;
}

function normalizeBaseUrl(value: string, fallback: string): string {
  const raw = (value || fallback || "").trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
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
export const ENABLE_FPMA_DISCOVERY = envBool("ENABLE_FPMA_DISCOVERY", true);
export const ENABLE_COUNTRY_MULTI_WIDGET_MOCK = envBool(
  "ENABLE_COUNTRY_MULTI_WIDGET_MOCK",
  process.env.NODE_ENV !== "production",
);
export const ENABLE_ALPHAVANTAGE_PROVIDER = envBool("ENABLE_ALPHAVANTAGE_PROVIDER", true);
export const ENABLE_NASDAQ_DATALINK_PROVIDER = envBool("ENABLE_NASDAQ_DATALINK_PROVIDER", true);
export const ENABLE_NASDAQ_CHRIS = envBool("ENABLE_NASDAQ_CHRIS", false);
export const ENABLE_EC_CEREALS_WIDGET = envBool("ENABLE_EC_CEREALS_WIDGET", true);
export const ENABLE_EC_OILSEEDS_WIDGET = envBool("ENABLE_EC_OILSEEDS_WIDGET", true);
export const ENABLE_USDA_NASS_WIDGET = envBool("ENABLE_USDA_NASS_WIDGET", true);
export const ENABLE_CANADA_GRAIN_RAIL_WIDGET = envBool("ENABLE_CANADA_GRAIN_RAIL_WIDGET", true);
export const ENABLE_WFP_MARKET_PRICES_WIDGET = envBool("ENABLE_WFP_MARKET_PRICES_WIDGET", true);
export const ENABLE_WB_MICRODATA_WIDGET = envBool("ENABLE_WB_MICRODATA_WIDGET", true);
export const ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET = envBool("ENABLE_EUROSTAT_AGRI_PRICE_INDICES_WIDGET", true);
export const ENABLE_USDA_PSD_WIDGET = envBool("ENABLE_USDA_PSD_WIDGET", true);
export const ENABLE_AMIS_GLOBAL_BALANCE_WIDGET = envBool("ENABLE_AMIS_GLOBAL_BALANCE_WIDGET", true);
export const ENABLE_IMF_PCPS_WIDGET = envBool("ENABLE_IMF_PCPS_WIDGET", true);
export const ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET = envBool("ENABLE_OECD_AGRICULTURAL_OUTLOOK_WIDGET", true);
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
export const USDA_MARS_PUBLIC_INDEX_URLS = (
  process.env.USDA_MARS_PUBLIC_INDEX_URLS ||
  "https://marsapi.ams.usda.gov/services/v1.1/public/listPublishedReports/all,https://marsapi.ams.usda.gov/services/v1.1/public/listPublishedReports"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
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
export const USDA_GTR_USER_AGENT =
  process.env.USDA_GTR_USER_AGENT ||
  "CroptoMonitor/1.0 (+https://cropto.abvx.xyz)";
export const USDA_GTR_DATASET_URLS = (
  process.env.USDA_GTR_DATASET_URLS ||
  `${USDA_GTR_BASE_URL}/GTRTable1.xlsx,${USDA_GTR_BASE_URL}/GTRFigure9.xlsx`
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const USDA_GTR_TIMEOUT_MS = envNum("USDA_GTR_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const USDA_GTR_CACHE_TTL_MS = envNum("USDA_GTR_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const USDA_GTR_MAX_SIGNALS = envNum("USDA_GTR_MAX_SIGNALS", 4);
export const FAOSTAT_BASE_URL =
  normalizeBaseUrl(
    process.env.FAOSTAT_BASE_URL || "",
    "https://fenixservices.fao.org/faostat/api/v1/en",
  );
export const FAOSTAT_DATASOURCE = process.env.FAOSTAT_DATASOURCE || "production";
export const FAOSTAT_TIMEOUT_MS = envNum("FAOSTAT_TIMEOUT_MS", 30_000);
export const FAOSTAT_CACHE_TTL_MS = envNum("FAOSTAT_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const FAOSTAT_DISCOVERY_TTL_MS = envNum("FAOSTAT_DISCOVERY_TTL_MS", 7 * 24 * 60 * 60 * 1000);
export const FAOSTAT_MAX_YEARS = envNum("FAOSTAT_MAX_YEARS", 5);
export const FPMA_API_BASE_URL =
  normalizeBaseUrl(
    process.env.FPMA_API_BASE_URL || "",
    "https://fpma.fao.org/giews/fpmat4/api",
  );
export const EC_AGRI_API_BASE_URL = normalizeBaseUrl(
  process.env.EC_AGRI_API_BASE_URL || "",
  "https://agridata.ec.europa.eu",
);
export const EC_CEREALS_API_PATH = process.env.EC_CEREALS_API_PATH || "/api/cereal";
export const EC_OILSEEDS_API_PATH = process.env.EC_OILSEEDS_API_PATH || "/api/oilseeds";
export const EC_AGRI_TIMEOUT_MS = envNum("EC_AGRI_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const EC_AGRI_CACHE_TTL_MS = envNum("EC_AGRI_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const EC_CEREALS_MEMBER_STATES = (process.env.EC_CEREALS_MEMBER_STATES || "FR,DE,PL,RO,ES")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const EC_OILSEEDS_MEMBER_STATES = (process.env.EC_OILSEEDS_MEMBER_STATES || "FR,DE,RO,BG,PL,ES")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const USDA_NASS_API_KEY = process.env.USDA_NASS_API_KEY || "";
export const USDA_NASS_BASE_URL = normalizeBaseUrl(
  process.env.USDA_NASS_BASE_URL || "",
  "https://quickstats.nass.usda.gov/api/api_GET",
);
export const USDA_NASS_TIMEOUT_MS = envNum("USDA_NASS_TIMEOUT_MS", 10_000);
export const USDA_NASS_CACHE_TTL_MS = envNum("USDA_NASS_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const CANADA_RAIL_WDS_BASE_URL = normalizeBaseUrl(
  process.env.CANADA_RAIL_WDS_BASE_URL || "",
  "https://www150.statcan.gc.ca/t1/wds/rest",
);
export const CANADA_RAIL_PRODUCT_ID = process.env.CANADA_RAIL_PRODUCT_ID || "23100275";
export const CANADA_RAIL_TIMEOUT_MS = envNum("CANADA_RAIL_TIMEOUT_MS", 10_000);
export const CANADA_RAIL_CACHE_TTL_MS = envNum("CANADA_RAIL_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const WFP_DATABRIDGES_TOKEN = process.env.WFP_DATABRIDGES_TOKEN || "";
export const WFP_DATABRIDGES_BASE_URL = normalizeBaseUrl(
  process.env.WFP_DATABRIDGES_BASE_URL || "",
  "https://hapi.humdata.org/api/v1/food-security-nutrition/food-prices",
);
export const WFP_DATABRIDGES_TIMEOUT_MS = envNum("WFP_DATABRIDGES_TIMEOUT_MS", 10_000);
export const WFP_DATABRIDGES_CACHE_TTL_MS = envNum("WFP_DATABRIDGES_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const WFP_DATABRIDGES_COUNTRIES = (process.env.WFP_DATABRIDGES_COUNTRIES || "UA,BR,AR")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const WFP_DATABRIDGES_MAX_RECORDS = envNum("WFP_DATABRIDGES_MAX_RECORDS", 200);
export const WB_MICRODATA_BASE_URL = normalizeBaseUrl(
  process.env.WB_MICRODATA_BASE_URL || "",
  "https://microdata.worldbank.org/index.php/catalog/4483",
);
export const WB_MICRODATA_TIMEOUT_MS = envNum("WB_MICRODATA_TIMEOUT_MS", 12_000);
export const WB_MICRODATA_CACHE_TTL_MS = envNum("WB_MICRODATA_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const WB_MICRODATA_COUNTRIES = (process.env.WB_MICRODATA_COUNTRIES || "UA,BR,AR")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const WB_MICRODATA_CSV_URL = process.env.WB_MICRODATA_CSV_URL || "";
export const EUROSTAT_BASE_URL = normalizeBaseUrl(
  process.env.EUROSTAT_BASE_URL || "",
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data",
);
export const EUROSTAT_AGRI_DATASETS = (
  process.env.EUROSTAT_AGRI_DATASETS ||
  "apri_pi20_outq,apri_pi20_outa"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const EUROSTAT_TIMEOUT_MS = envNum("EUROSTAT_TIMEOUT_MS", 10_000);
export const EUROSTAT_CACHE_TTL_MS = envNum("EUROSTAT_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const EUROSTAT_MEMBER_STATES = (process.env.EUROSTAT_MEMBER_STATES || "FR,DE,PL,RO,ES,EU")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
export const USDA_FAS_API_KEY = process.env.USDA_FAS_API_KEY || "";
export const USDA_FAS_OPENDATA_BASE_URL = normalizeBaseUrl(
  process.env.USDA_FAS_OPENDATA_BASE_URL || "",
  "https://apps.fas.usda.gov/OpenData/api",
);
export const USDA_PSD_TIMEOUT_MS = envNum("USDA_PSD_TIMEOUT_MS", 15_000);
export const USDA_PSD_CACHE_TTL_MS = envNum("USDA_PSD_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const USDA_PSD_MAX_YEARS = envNum("USDA_PSD_MAX_YEARS", 8);
export const AMIS_BASE_URL = normalizeBaseUrl(
  process.env.AMIS_BASE_URL || "",
  "https://legacy.amis-outlook.org/amis-monitoring",
);
export const AMIS_MARKET_MONITOR_URL =
  process.env.AMIS_MARKET_MONITOR_URL ||
  `${AMIS_BASE_URL}/`;
export const AMIS_MARKET_MONITOR_CURRENT_PDF_URL =
  process.env.AMIS_MARKET_MONITOR_CURRENT_PDF_URL ||
  "https://legacy.amis-outlook.org/fileadmin/user_upload/amis/docs/Market_monitor/AMIS_Market_Monitor_current.pdf";
export const AMIS_TIMEOUT_MS = envNum("AMIS_TIMEOUT_MS", 12_000);
export const AMIS_CACHE_TTL_MS = envNum("AMIS_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const IMF_PCPS_PAGE_URL =
  process.env.IMF_PCPS_PAGE_URL ||
  "https://www.imf.org/en/Research/commodity-prices";
export const IMF_PCPS_TABLE2_URL =
  process.env.IMF_PCPS_TABLE2_URL ||
  "https://www.imf.org/-/media/Files/Research/CommodityPrices/Monthly/Table2.ashx";
export const IMF_PCPS_TIMEOUT_MS = envNum("IMF_PCPS_TIMEOUT_MS", 12_000);
export const IMF_PCPS_CACHE_TTL_MS = envNum("IMF_PCPS_CACHE_TTL_MS", 12 * 60 * 60 * 1000);
export const OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL =
  process.env.OECD_AGRICULTURAL_OUTLOOK_CEREALS_URL ||
  "https://www.oecd.org/en/publications/2025/07/oecd-fao-agricultural-outlook-2025-2034_3eb15914/full-report/cereals_251d1ece.html";
export const OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL =
  process.env.OECD_AGRICULTURAL_OUTLOOK_OILSEEDS_URL ||
  "https://www.oecd.org/en/publications/oecd-fao-agricultural-outlook-2025-2034_601276cd-en/full-report/oilseeds-and-oilseed-products_42c09daa.html";
export const OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS = envNum("OECD_AGRICULTURAL_OUTLOOK_TIMEOUT_MS", 12_000);
export const OECD_AGRICULTURAL_OUTLOOK_CACHE_TTL_MS = envNum("OECD_AGRICULTURAL_OUTLOOK_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const FPMA_DATA_PATHS = (
  process.env.FPMA_DATA_PATHS ||
  "prices,PriceQuotation,v1/prices,v1/PriceQuotation"
)
  .split(",")
  .map((value) => value.trim().replace(/^\/+/, ""))
  .filter(Boolean);
export const FPMA_TIMEOUT_MS = envNum("FPMA_TIMEOUT_MS", GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
export const FPMA_CACHE_TTL_MS = envNum("FPMA_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
export const FPMA_DISCOVERY_TTL_MS = envNum("FPMA_DISCOVERY_TTL_MS", 7 * 24 * 60 * 60 * 1000);
export const FPMA_DISCOVERY_CACHE_TTL_MS = envNum("FPMA_DISCOVERY_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
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
export const FPMA_PRICE_TYPES = (
  process.env.FPMA_PRICE_TYPES ||
  FPMA_SUPPORTED_PRICE_TYPES.join(",")
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
    WHEAT: {
      label: "Wheat",
      synonyms: ["wheat", "triticum", "soft wheat", "durum"],
      fpmaCommodityIds: [],
      notes: "Prefer generic wheat; avoid milling-only classes unless explicitly present.",
    },
    MAIZE: {
      label: "Maize (Corn)",
      synonyms: ["maize", "corn", "yellow maize", "white maize"],
      fpmaCommodityIds: [],
      notes: "Maize and corn are canonical synonyms of the same crop.",
    },
    SOY: {
      label: "Soybeans",
      synonyms: ["soy", "soybean", "soybeans", "soya"],
      fpmaCommodityIds: [],
      notes: "Soybeans only (not soybean meal/oil) in FPMA tile.",
    },
    RAPESEED: {
      label: "Rapeseed (Canola)",
      synonyms: ["rapeseed", "canola", "colza"],
      fpmaCommodityIds: [],
      notes: "If rapeseed is missing do not proxy with vegetable oils inside FPMA tile.",
    },
    SUNFLOWER: {
      label: "Sunflower seed",
      synonyms: ["sunflower", "sunflower seed", "sunflower seeds"],
      fpmaCommodityIds: [],
      notes: "Seed-level prices; do not mix with sunflower oil unless explicitly returned.",
    },
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
  .map((value) => value.trim())
  .filter(Boolean);
export const NASDAQ_CHRIS_DATASETS = (process.env.NASDAQ_CHRIS_DATASETS || "")
  .split(",")
  .map((value) => value.trim())
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
