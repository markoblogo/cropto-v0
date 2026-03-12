import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Maximize2, Minimize2, Moon, Pin, Plus, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type MonitorRole = "all" | "farmer" | "trader" | "broker";
type MonitorTopic = "all" | "markets" | "logistics" | "policy" | "weather";
type Country = "US" | "UA" | "BR" | "AR" | "FR" | "DE" | "RO";
type GridGrouping = "manual" | "topic" | "source";
type GridSort = "default" | "impact" | "freshness" | "source";

type NewsItem = {
  id: string;
  title: string;
  summary?: string;
  source_name: string;
  published_at: string;
  topic_tags?: string[];
  url?: string;
};

type NewsResponse = {
  generatedAt?: string;
  topSignals?: NewsItem[];
  feed?: NewsItem[];
  sidePanels?: { logistics?: NewsItem[]; policy?: NewsItem[] };
};

type GrainWidgetRecord = {
  status?: string;
  sourceName?: string;
  sourceUrl?: string;
  updatedAt?: string;
  territory?: { code?: string; label?: string };
  notes?: string[];
  rows?: Array<{ label?: string; price?: { valueCurrent?: number; unit?: string; changePct?: number } }>;
  items?: Array<{ label?: string; value?: number; unit?: string; changePct?: number }>;
  cards?: Array<{ title?: string; value?: number; unit?: string; deltaPct?: number }>;
};

type GrainWidgetsResponse = {
  widgets?: {
    byKind?: Record<string, GrainWidgetRecord>;
    order?: string[];
  };
};

type GrainMarketWidgetItem = {
  instrumentKey: string;
  title: string;
  subtitle?: string;
  status: string;
  sourceName?: string;
  sourceUrl?: string;
  valueCurrent?: number;
  valueChangePct?: number;
  currency?: string;
  unit?: string;
};

type GrainMarketsResponse = {
  widgets?: {
    cbot?: GrainMarketWidgetItem[];
    euronext?: GrainMarketWidgetItem[];
  };
};

type LogisticsIndicator = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  sourceName: string;
  sourceUrl?: string;
  valueCurrent?: number;
  valueChangePct?: number;
  unit: string;
};

type LogisticsIndicatorsResponse = {
  widgets?: LogisticsIndicator[];
};

type MonitorIndex = {
  slug: string;
  name: string;
  source: string;
  value: number;
  change?: number;
  updatedAt?: string;
};

type IndicesResponse = {
  items?: MonitorIndex[];
};

type FxResponse = {
  enabled?: boolean;
  mode?: "live" | "coming_soon";
  asOf?: string;
  source?: string;
  rates?: Array<{ currency: string; usdPerUnit: number }>;
};

type PredictionRiskIndex = {
  key: "inflation_risk" | "rates_risk" | "geopolitics_risk" | "grain_risk";
  label: string;
  value: number | null;
  contributors: number;
  totalWeight: number;
};

type PredictionMarketRow = {
  id: string;
  source: "kalshi" | "polymarket";
  question: string;
  impliedProbability: number;
  volume24h: number;
  liquidityScore: number;
  orderbookSpreadBps?: number;
  qualityScore?: number;
  closeTime?: string;
  region: string;
  tags: string[];
};

type PredictionMarketsResponse = {
  generatedAt?: string;
  cacheHit?: boolean;
  marketCount?: number;
  indices?: PredictionRiskIndex[];
  directGrainMarkets?: PredictionMarketRow[];
  sources?: {
    kalshi?: { ok: boolean; count: number; error?: string };
    polymarket?: { ok: boolean; count: number; error?: string };
  };
};

type PredictionRiskTrendsResponse = {
  generatedAt?: string;
  hours?: number;
  byIndex?: Record<
    "inflation_risk" | "rates_risk" | "geopolitics_risk" | "grain_risk",
    {
      latest: number | null;
      delta24h: number | null;
      delta7d: number | null;
      points: Array<{ ts: string; value: number }>;
    }
  >;
};

type AgroExpectationsResponse = {
  generatedAt?: string;
  cacheHit?: boolean;
  barometer?: {
    status?: string;
    source?: string;
    updatedAt?: string;
    agEconomy?: number | null;
    currentConditions?: number | null;
    futureExpectations?: number | null;
    note?: string;
  };
  etfProxies?: {
    status?: string;
    rows?: Array<{
      symbol: string;
      label: string;
      price: number | null;
      dayChangePct: number | null;
      d30ChangePct: number | null;
      series?: number[];
      status?: string;
    }>;
    cgoComposite?: {
      value: number | null;
      dayChangePct: number | null;
      d30ChangePct: number | null;
      weights?: Record<string, number>;
      series?: number[];
      note?: string;
    };
  };
};

type AgroCompositeTrendsResponse = {
  generatedAt?: string;
  hours?: number;
  region?: string;
  byIndex?: Record<
    "cgo_basic" | "cgo_ext",
    {
      latest: number | null;
      delta24h: number | null;
      delta7d: number | null;
      points: Array<{ ts: string; value: number }>;
    }
  >;
};

type CgoWeightsResponse = {
  generatedAt?: string;
  year?: number;
  region?: string;
  rows?: Array<{ commodity: string; weight: number; source?: string; updatedAt?: string }>;
};

type BinanceSnapshotResponse = {
  generatedAt?: string;
  cacheHit?: boolean;
  status?: string;
  rows?: Array<{
    symbol: string;
    assetType: "crypto_spot" | "token_commodity" | "options_agg";
    underlying: string;
    price: number | null;
    priceChange24hPct: number | null;
    volume24h: number | null;
    openInterest: number | null;
    impliedVolatility: number | null;
    source: string;
    status: string;
    series?: number[];
  }>;
  macroRisk?: {
    score: number | null;
    btcVolProxy: number | null;
    ethVolProxy: number | null;
    note?: string;
  };
};

type BinanceRiskTrendsResponse = {
  generatedAt?: string;
  hours?: number;
  bySymbol?: Record<
    string,
    {
      latest: number | null;
      delta24h: number | null;
      delta7d: number | null;
      points: Array<{ ts: string; value: number }>;
    }
  >;
  macroRisk?: {
    score: number | null;
    avgIv: number | null;
    avgAbsMove: number | null;
  };
};

type GlobalIndicesResponse = {
  generatedAt?: string;
  cacheHit?: boolean;
  status?: "REFRESH" | "INDICATIVE" | "CONSTRAINED";
  providerMode?: "twelvedata" | "fallback";
  rows?: Array<{
    symbol: string;
    name: string;
    region: "US" | "EU" | "EM" | "BR" | "AR";
    value: number | null;
    dayChangePct: number | null;
    provider: string;
    source: "eod" | "intraday" | "fallback";
    series?: number[];
    status: "REFRESH" | "INDICATIVE" | "CONSTRAINED";
    note?: string;
  }>;
  riskOnOff?: {
    regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
    score: number | null;
    matrix?: Array<{ label: string; value: number | null }>;
    note?: string;
  };
  crossAsset?: {
    btc: number | null;
    gold: number | null;
    oil: number | null;
    dxy: number | null;
    note?: string;
  };
};

type GlobalIndicesTrendsResponse = {
  generatedAt?: string;
  hours?: number;
  status?: string;
  provider?: string;
  bySymbol?: Record<
    string,
    {
      latest: number | null;
      delta24h: number | null;
      delta7d: number | null;
      points: Array<{ ts: string; value: number }>;
    }
  >;
};

type YieldCropFilter = "ALL" | "WHEAT" | "MAIZE" | "RICE" | "SOYBEAN" | "SORGHUM" | "MILLET" | "SYNTHESIS";

type YieldFoodSecurityResponse = {
  generatedAt?: string;
  cacheHit?: boolean;
  country?: string;
  crop?: YieldCropFilter;
  geoglam?: {
    status?: "REFRESH" | "INDICATIVE" | "CONSTRAINED";
    source?: string;
    archiveUrl?: string;
    selectedCount?: number;
    latestUpdate?: string;
    note?: string;
    datasets?: Array<{
      id: string;
      title: string;
      crop: YieldCropFilter;
      sourceUrl: string;
      thumbnailUrl?: string;
      updatedAt?: string;
      countryRelevant?: boolean;
      tags?: string[];
      snippet?: string;
    }>;
  };
  foodPrices?: {
    status?: "REFRESH" | "INDICATIVE" | "CONSTRAINED";
    source?: string;
    faoRows?: Array<{
      label: string;
      value: string;
      deltaPct?: number;
      series?: number[];
    }>;
  };
  foodSecurity?: {
    status?: "REFRESH" | "INDICATIVE" | "CONSTRAINED";
    source?: string;
    score?: number | null;
    localDeviation?: number | null;
    globalDeviation?: number | null;
    localScore?: number | null;
    globalScore?: number | null;
    marketRows?: Array<{
      source: "WFP" | "WB";
      crop: string;
      label: string;
      value: string;
      changePct?: number;
      current?: number;
      unit?: string;
      currency?: string;
    }>;
    note?: string;
  };
};

type DirectPredictionSort = "liquidity" | "volume" | "quality";
type DirectPredictionRegion = "ALL" | "GLOBAL" | Country;
type GeoLayerId = "markets" | "logistics" | "weather" | "risk";
type GeoPoint = {
  id: string;
  layer: GeoLayerId;
  country: Country;
  x: number;
  y: number;
  intensity: number;
  label: string;
  value: string;
};

type GridWidget = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  source: string;
  updatedAt?: string;
  topic: Exclude<MonitorTopic, "all">;
  roles: Array<Exclude<MonitorRole, "all">>;
  territory: string;
  metrics: Array<{ label: string; value: string; delta?: number; deltaFormat?: "pct" | "abs"; href?: string; series?: number[] }>;
};
type CardType = "quote" | "table" | "news" | "health";
type ProviderDebug = {
  providerId: string;
  status?: string;
  mappedCount?: number;
  sourceUrlUsed?: string;
  finalUrl?: string;
  httpStatus?: number;
  lastFetchAt?: string;
  lastError?: {
    errorKind?: string;
    message?: string;
    httpStatus?: number;
  };
  notes?: string[];
};
type ActivationReportResponse = {
  providers?: ProviderDebug[];
};

type ProviderHealthRow = {
  providerId: string;
  state: "live" | "degraded" | "empty";
  status: string;
  mapped: number;
  errorKind: string;
  httpStatus?: number;
  lastFetchAt?: string;
  rationale: string;
};

type TopicHealthRow = {
  topic: Exclude<MonitorTopic, "all">;
  live: number;
  total: number;
  livePercent: number;
};

type GridLayout = { w: 1 | 2 | 3; h: 1 | 2 };
type CustomWidgetDraft = {
  title: string;
  subtitle: string;
  source: string;
  topic: Exclude<MonitorTopic, "all">;
};
type RenderMode = "metric" | "spark" | "bar" | "list";
type RenderModeOverride = "auto" | RenderMode;
type RenderPreset = "mixed" | "data_dense" | "headlines";
type HealthFilter = "all" | "live" | "degraded" | "empty";
type VideoSourceStatus = "LIVE_EMBED" | "LIVE_STREAM" | "CONSTRAINED" | "CONTRACT_REQUIRED";
type VideoTopic = "all" | "logistics" | "agro" | "news" | "finance";
type VideoSource = {
  id: string;
  name: string;
  category: "markets_tv" | "ports" | "custom";
  status: VideoSourceStatus;
  mode: "iframe" | "video" | "link";
  url?: string;
  note?: string;
};

const STORAGE_PREFIX = "monitor_v3_";
const STORAGE_KEYS = {
  role: `${STORAGE_PREFIX}role`,
  topic: `${STORAGE_PREFIX}topic`,
  country: `${STORAGE_PREFIX}country`,
  grouping: `${STORAGE_PREFIX}grouping`,
  sort: `${STORAGE_PREFIX}sort`,
  order: `${STORAGE_PREFIX}order`,
  hidden: `${STORAGE_PREFIX}hidden`,
  layout: `${STORAGE_PREFIX}layout`,
  custom: `${STORAGE_PREFIX}custom`,
  clockZones: `${STORAGE_PREFIX}clock_zones`,
  fxPairs: `${STORAGE_PREFIX}fx_pairs`,
  renderModes: `${STORAGE_PREFIX}render_modes`,
  heroPins: `${STORAGE_PREFIX}hero_pins`,
  liveOnly: `${STORAGE_PREFIX}live_only`,
  healthFilter: `${STORAGE_PREFIX}health_filter`,
  pinDenseTop: `${STORAGE_PREFIX}pin_dense_top`,
  directPredictionSort: `${STORAGE_PREFIX}direct_prediction_sort`,
  directPredictionRegion: `${STORAGE_PREFIX}direct_prediction_region`,
  yieldCrop: `${STORAGE_PREFIX}yield_crop`,
  videoTopic: `${STORAGE_PREFIX}video_topic`,
  videoChannel: `${STORAGE_PREFIX}video_channel`,
};

const VIDEO_TOPIC_OPTIONS: Array<{ id: VideoTopic; label: string }> = [
  { id: "all", label: "All" },
  { id: "logistics", label: "Logistics" },
  { id: "agro", label: "Agro" },
  { id: "news", label: "News" },
  { id: "finance", label: "Finance" },
];

const STATIC_VIDEO_SOURCES: VideoSource[] = [
  {
    id: "portmiami-earthcam",
    name: "PortMiami (EarthCam)",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://www.earthcam.com/js/video/embed.php?type=h264&vid=pomcam02.flv&w=auto&company=POM&timezone=America/New_York&metar=KTEB&ecn=0&requested_version=current",
    note: "Live terminal gate camera",
  },
  {
    id: "windy-port-du-belon",
    name: "Windy Port du Belon",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1759341131/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-port-brest",
    name: "Windy Port de Brest",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1387019411/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-belfast-harbor",
    name: "Windy Belfast Harbor",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1499929860/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-port-la-nouvelle",
    name: "Windy Port-la-Nouvelle",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1670794052/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-port-dielette",
    name: "Windy Port Dielette",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1604501954/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-saint-michel-port",
    name: "Windy Saint-Michel Port",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1500932923/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-port-angeles-harbor",
    name: "Windy Port Angeles Harbor",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1456035645/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-newhaven-harbor",
    name: "Windy Newhaven Harbour",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1461491943/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-port-morgat",
    name: "Windy Port de Morgat",
    category: "ports",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1630228543/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-rieux-farm",
    name: "Windy Rieux Farm",
    category: "custom",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1350034804/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-molletts-farm",
    name: "Windy Mollett's Farm",
    category: "custom",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1406647437/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "windy-tora-farm-settlement",
    name: "Windy Tora Farm Settlement",
    category: "custom",
    status: "LIVE_EMBED",
    mode: "iframe",
    url: "https://webcams.windy.com/webcams/public/embed/player/1595374047/day",
    note: "Public Windy webcam embed",
  },
  {
    id: "moneycontrol-live-tv",
    name: "Moneycontrol Live TV",
    category: "markets_tv",
    status: "CONSTRAINED",
    mode: "link",
    url: "https://www.moneycontrol.com/tv/live-event",
    note: "Consent/login gate",
  },
  {
    id: "lseg-newscasts",
    name: "LSEG Newscasts",
    category: "markets_tv",
    status: "CONTRACT_REQUIRED",
    mode: "link",
    url: "https://www.lseg.com/en/data-analytics/products/lseg-newscasts-financial-video-platform",
    note: "Commercial API/embed contract required",
  },
  {
    id: "port-montreal-cams",
    name: "Port of Montreal",
    category: "ports",
    status: "CONSTRAINED",
    mode: "link",
    url: "https://www.port-montreal.com/en/goods/real-time/cameras",
    note: "Frame restrictions / challenge",
  },
  {
    id: "geelong-webcams",
    name: "Geelong Webcams",
    category: "ports",
    status: "CONSTRAINED",
    mode: "link",
    url: "https://www.onlygeelong.com.au/vrca-webcams",
    note: "Frame restrictions",
  },
];

const ROLE_OPTIONS: Array<{ id: MonitorRole; label: string }> = [
  { id: "all", label: "Show All" },
  { id: "farmer", label: "Farmer" },
  { id: "trader", label: "Trader" },
  { id: "broker", label: "Broker" },
];

const TOPIC_OPTIONS: Array<{ id: MonitorTopic; label: string }> = [
  { id: "all", label: "All" },
  { id: "markets", label: "Markets" },
  { id: "logistics", label: "Logistics" },
  { id: "policy", label: "Policy" },
  { id: "weather", label: "Weather" },
];

const COUNTRY_OPTIONS: Array<{ id: Country; label: string }> = [
  { id: "US", label: "United States" },
  { id: "UA", label: "Ukraine" },
  { id: "BR", label: "Brazil" },
  { id: "AR", label: "Argentina" },
  { id: "FR", label: "France" },
  { id: "DE", label: "Germany" },
  { id: "RO", label: "Romania" },
];
const YIELD_CROP_OPTIONS: Array<{ id: YieldCropFilter; label: string }> = [
  { id: "ALL", label: "All crops" },
  { id: "WHEAT", label: "Wheat" },
  { id: "MAIZE", label: "Maize" },
  { id: "RICE", label: "Rice" },
  { id: "SOYBEAN", label: "Soybean" },
  { id: "SORGHUM", label: "Sorghum" },
  { id: "MILLET", label: "Millet" },
  { id: "SYNTHESIS", label: "Synthesis" },
];
const COUNTRY_NEWS_HINTS: Record<Country, string[]> = {
  US: ["united states", "u.s.", "usa", "us "],
  UA: ["ukraine", "ukrainian", "kyiv", "odesa", "odessa", "black sea"],
  BR: ["brazil", "brazilian", "sao paulo", "parana"],
  AR: ["argentina", "argentine", "buenos aires", "rosario"],
  FR: ["france", "french", "paris"],
  DE: ["germany", "german", "berlin", "hamburg"],
  RO: ["romania", "romanian", "bucharest", "constanta"],
};
const COUNTRY_GEO_ANCHORS: Record<Country, { x: number; y: number; label: string }> = {
  US: { x: 195, y: 180, label: "US" },
  UA: { x: 538, y: 127, label: "UA" },
  BR: { x: 295, y: 285, label: "BR" },
  AR: { x: 286, y: 355, label: "AR" },
  FR: { x: 495, y: 135, label: "FR" },
  DE: { x: 515, y: 120, label: "DE" },
  RO: { x: 546, y: 137, label: "RO" },
};
const GEO_LAYER_META: Record<GeoLayerId, { label: string; tone: string; stroke: string }> = {
  markets: { label: "Markets", tone: "text-cyan-300", stroke: "#22d3ee" },
  logistics: { label: "Logistics", tone: "text-amber-300", stroke: "#f59e0b" },
  weather: { label: "Weather", tone: "text-emerald-300", stroke: "#34d399" },
  risk: { label: "Risk", tone: "text-rose-300", stroke: "#fb7185" },
};
const KIND_TO_TOPIC: Record<string, Exclude<MonitorTopic, "all">> = {
  GLOBAL_SPOT_TABLE: "markets",
  CROP_PRICE_INDEX: "markets",
  USDA_MARS_REPORTS: "policy",
  US_CASH_EXPORT_CONTEXT: "logistics",
  USDA_MARS_DAILY_MARKET_RATES_TXT: "markets",
  ALPHAVANTAGE_GRAIN_BENCHMARKS: "markets",
  NASDAQ_DATA_LINK_SNAPSHOT: "markets",
  EC_CEREALS_MULTI_COUNTRY: "markets",
  EC_OILSEEDS_MULTI_COUNTRY: "markets",
  USDA_NASS_PRODUCER_PRICES: "markets",
  WFP_MARKET_PRICES_MULTI_COUNTRY: "markets",
  WB_MICRODATA_MARKET_PRICES: "markets",
  EUROSTAT_AGRI_PRICE_INDICES: "markets",
  USDA_PSD_BALANCES: "policy",
  AMIS_GLOBAL_BALANCE: "policy",
  IMF_COMMODITY_BENCHMARKS: "markets",
  OECD_AGRICULTURAL_OUTLOOK: "policy",
  USDA_GTR_LOGISTICS_SNAPSHOT: "logistics",
  CANADA_GRAIN_RAIL_PERFORMANCE: "logistics",
  FAOSTAT_PP_MULTI_COUNTRY: "markets",
  FPMA_MARKET_PRICES_MULTI_COUNTRY: "markets",
};

const KIND_TO_ROLES: Record<string, Array<Exclude<MonitorRole, "all">>> = {
  USDA_GTR_LOGISTICS_SNAPSHOT: ["trader", "broker"],
  CANADA_GRAIN_RAIL_PERFORMANCE: ["trader", "broker"],
  USDA_PSD_BALANCES: ["farmer", "trader", "broker"],
  AMIS_GLOBAL_BALANCE: ["farmer", "trader", "broker"],
  USDA_NASS_PRODUCER_PRICES: ["farmer", "trader"],
};
const WIDGET_KIND_TO_PROVIDER: Record<string, string> = {
  GLOBAL_SPOT_TABLE: "dbnomics-worldbank",
  CROP_PRICE_INDEX: "fao-ffpi",
  USDA_MARS_REPORTS: "usda-mars-public",
  US_CASH_EXPORT_CONTEXT: "us-cash-export-context",
  USDA_MARS_DAILY_MARKET_RATES_TXT: "usda-mars-daily-txt",
  ALPHAVANTAGE_GRAIN_BENCHMARKS: "alpha-vantage-commodities",
  NASDAQ_DATA_LINK_SNAPSHOT: "nasdaq-datalink",
  EC_CEREALS_MULTI_COUNTRY: "ec-cereals-prices",
  EC_OILSEEDS_MULTI_COUNTRY: "ec-oilseeds-prices",
  USDA_NASS_PRODUCER_PRICES: "usda-nass-quickstats",
  WFP_MARKET_PRICES_MULTI_COUNTRY: "wfp-databridges",
  WB_MICRODATA_MARKET_PRICES: "worldbank-microdata",
  EUROSTAT_AGRI_PRICE_INDICES: "eurostat-agri-indices",
  USDA_PSD_BALANCES: "usda-psd",
  AMIS_GLOBAL_BALANCE: "amis-outlook",
  IMF_COMMODITY_BENCHMARKS: "imf-pcps",
  OECD_AGRICULTURAL_OUTLOOK: "oecd-agricultural-outlook",
  USDA_GTR_LOGISTICS_SNAPSHOT: "usda-gtr-logistics",
  CANADA_GRAIN_RAIL_PERFORMANCE: "canada-grain-rail-performance",
  FAOSTAT_PP_MULTI_COUNTRY: "faostat-pp",
  FPMA_MARKET_PRICES_MULTI_COUNTRY: "fpma-market-prices",
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function labelFromKind(kind: string) {
  return kind
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatMetric(current?: number, unit?: string) {
  if (typeof current !== "number") return "n/a";
  return `${current.toFixed(2)} ${unit || ""}`.trim();
}

function pickMetrics(widget?: GrainWidgetRecord): Array<{ label: string; value: string; delta?: number; series?: number[] }> {
  const metrics: Array<{ label: string; value: string; delta?: number; series?: number[] }> = [];
  (widget?.rows || []).slice(0, 3).forEach((row) => {
    const price = row.price as
      | {
          valueCurrent?: number;
          changePct?: number;
          unit?: string;
          normalizedValueCurrent?: number;
          normalizedValueChangePct?: number;
          normalizedUnit?: string;
          normalizedCurrency?: string;
          nativeValueCurrent?: number;
          nativeValueChangePct?: number;
          nativeUnit?: string;
          series?: Array<{ value?: number }>;
        }
      | undefined;
    const current =
      price?.normalizedValueCurrent ??
      price?.valueCurrent ??
      price?.nativeValueCurrent;
    const delta =
      price?.normalizedValueChangePct ??
      price?.changePct ??
      price?.nativeValueChangePct;
    const unit = price?.normalizedUnit || price?.unit || price?.nativeUnit;
    const currency = price?.normalizedCurrency || "";
    const series = (price?.series || [])
      .map((point) => (typeof point.value === "number" ? point.value : null))
      .filter((point): point is number => point !== null);
    if (typeof current === "number") {
      metrics.push({
        label: row.label || "Value",
        value: formatMetric(current, [currency, unit].filter(Boolean).join("/")),
        delta,
        series: series.length >= 2 ? series : undefined,
      });
    }
  });
  if (metrics.length) return metrics;
  (widget?.items || []).slice(0, 3).forEach((row) => {
    if (typeof row.value === "number") {
      metrics.push({ label: row.label || "Value", value: formatMetric(row.value, row.unit), delta: row.changePct });
    }
  });
  if (metrics.length) return metrics;
  (widget?.cards || []).slice(0, 3).forEach((row) => {
    if (typeof row.value === "number") {
      metrics.push({ label: row.title || "Value", value: formatMetric(row.value, row.unit), delta: row.deltaPct });
    }
  });
  return metrics;
}

function pickFallbackMetrics(widget?: GrainWidgetRecord): Array<{ label: string; value: string; delta?: number }> {
  if (!widget) return [{ label: "Status", value: "No payload" }];
  const notes = widget.notes || [];
  const metrics: Array<{ label: string; value: string; delta?: number }> = [];

  const coverage = notes.find((note) => /coverage\s*\d+\s*\/\s*\d+/i.test(note));
  if (coverage) metrics.push({ label: "Coverage", value: coverage });

  const cadence = notes.find((note) => /cadence/i.test(note));
  if (cadence) metrics.push({ label: "Cadence", value: cadence.replace(/^.*cadence[:\s]*/i, "") || cadence });

  const territoryLabel = widget.territory?.label || widget.territory?.code;
  if (territoryLabel) metrics.push({ label: "Territory", value: territoryLabel });

  const firstNote = notes.find((note) => note && note.length > 0);
  if (firstNote) metrics.push({ label: "Note", value: firstNote.slice(0, 72) });

  if (widget.updatedAt) {
    const ts = new Date(widget.updatedAt);
    if (!Number.isNaN(ts.getTime())) {
      metrics.push({
        label: "Updated",
        value: ts.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }),
      });
    }
  }

  if (metrics.length === 0) {
    metrics.push({
      label: "Status",
      value: widget.status ? `${widget.status} payload without numeric rows` : "Payload without numeric rows",
    });
  }

  return metrics.slice(0, 3);
}

function getStatusTone(status: string) {
  const key = status.toUpperCase();
  if (key === "REFRESH" || key === "LIVE") return "border-emerald-500/60 text-emerald-300";
  if (key === "INDICATIVE") return "border-cyan-500/60 text-cyan-300";
  if (key === "CONSTRAINED") return "border-amber-500/60 text-amber-300";
  if (key === "FALLBACK") return "border-blue-500/60 text-blue-300";
  if (key === "CUSTOM") return "border-violet-500/60 text-violet-300";
  return "border-red-500/60 text-red-300";
}

function getStatusRank(status: string) {
  const key = status.toUpperCase();
  if (key === "LIVE") return 5;
  if (key === "REFRESH") return 4;
  if (key === "INDICATIVE") return 3;
  if (key === "CONSTRAINED") return 2;
  if (key === "FALLBACK") return 2;
  if (key === "CUSTOM") return 2;
  return 1;
}

function isDegradedStatus(status: string) {
  const key = status.toUpperCase();
  return key === "FALLBACK" || key === "OFFLINE" || key === "CONSTRAINED";
}

function metricLooksUsable(metric: { value: string }) {
  const value = (metric.value || "").toLowerCase().trim();
  if (!value) return false;
  if (value === "n/a") return false;
  if (value.includes("no payload")) return false;
  if (value.includes("no numeric")) return false;
  if (value.includes("without numeric")) return false;
  return true;
}

function widgetDataState(widget: GridWidget): "live" | "degraded" | "empty" {
  if (isIndexCardStale(widget)) return "degraded";
  const hasUsable = widget.metrics.some(metricLooksUsable);
  if (!hasUsable) return "empty";
  if (isDegradedStatus(widget.status)) return "degraded";
  return "live";
}

function parseTimestamp(value?: string): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function isIndexCard(widget: GridWidget) {
  return widget.id.startsWith("IDX_");
}

function staleAgeMs(widget: GridWidget): number | null {
  const ts = parseTimestamp(widget.updatedAt);
  if (ts === null) return null;
  return Date.now() - ts;
}

function isIndexCardStale(widget: GridWidget) {
  if (!isIndexCard(widget)) return false;
  const ageMs = staleAgeMs(widget);
  if (ageMs === null) return false;
  return ageMs > 24 * 60 * 60 * 1000;
}

function formatStaleAge(widget: GridWidget) {
  const ageMs = staleAgeMs(widget);
  if (ageMs === null) return null;
  const totalMinutes = Math.floor(ageMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 48) return `${totalHours}h`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d`;
}

function formatAgeShort(updatedAt?: string) {
  const ts = parseTimestamp(updatedAt);
  if (ts === null) return "n/a";
  const ageMs = Date.now() - ts;
  if (!Number.isFinite(ageMs) || ageMs < 0) return "n/a";
  const totalMinutes = Math.floor(ageMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 48) return `${totalHours}h`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function inferNewsCountry(item: NewsItem): Country | null {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  for (const [countryCode, hints] of Object.entries(COUNTRY_NEWS_HINTS) as Array<[Country, string[]]>) {
    if (hints.some((hint) => text.includes(hint))) return countryCode;
  }
  return null;
}

function computeDataCompletenessScore(widget: GridWidget) {
  const statusRank = getStatusRank(widget.status);
  const usableCount = widget.metrics.filter(metricLooksUsable).length;
  const totalCount = widget.metrics.length || 1;
  const numericCount = widget.metrics
    .map((metric) => parseMetricNumber(metric.value))
    .filter((value): value is number => value !== null).length;
  let score = statusRank * 16;
  score += Math.round((usableCount / totalCount) * 24);
  score += Math.min(18, numericCount * 6);
  if (isDegradedStatus(widget.status)) score -= 14;
  if (widgetDataState(widget) === "empty") score -= 20;
  if (isIndexCardStale(widget)) score -= 18;
  return Math.max(0, Math.min(100, score));
}

function completenessTone(score: number) {
  if (score >= 75) return "border-emerald-500/70 bg-emerald-500/10 text-emerald-300";
  if (score >= 45) return "border-amber-500/70 bg-amber-500/10 text-amber-300";
  return "border-red-500/70 bg-red-500/10 text-red-300";
}

function hostFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function inferVideoTopic(source: VideoSource): Exclude<VideoTopic, "all"> {
  const text = `${source.id} ${source.name} ${source.note || ""}`.toLowerCase();
  if (text.includes("farm") || text.includes("agri") || text.includes("grain")) return "agro";
  if (text.includes("tv") || text.includes("newscast") || text.includes("finance") || text.includes("bloomberg")) return "finance";
  if (text.includes("news")) return "news";
  if (text.includes("port") || text.includes("harbor") || text.includes("webcam") || text.includes("earthcam") || text.includes("windy")) return "logistics";
  return "news";
}

function buildDataFirstFallbackRows(
  widget: GridWidget,
  state: "live" | "degraded" | "empty",
  debug?: ProviderDebug,
): Array<{ label: string; value: string; delta?: number; deltaFormat?: "pct" | "abs"; href?: string; series?: number[] }> {
  if (state === "live") return [];
  const usableCount = widget.metrics.filter(metricLooksUsable).length;
  const totalCount = widget.metrics.length;
  const freshness = formatAgeShort(widget.updatedAt);
  const errorKind = debug?.lastError?.errorKind || "unknown";
  const http = debug?.httpStatus ?? debug?.lastError?.httpStatus;
  const sourceHost = hostFromUrl(debug?.finalUrl || debug?.sourceUrlUsed);
  const modeHint = widget.status.toUpperCase() === "INDICATIVE" ? "indicative baseline" : "constrained upstream";
  const finalHost = hostFromUrl(debug?.finalUrl);
  const sourceHostUsed = hostFromUrl(debug?.sourceUrlUsed);
  return [
    { label: "State", value: state === "degraded" ? modeHint : "no usable rows in latest fetch" },
    { label: "Error kind", value: String(errorKind).toLowerCase() },
    { label: "HTTP", value: http != null ? String(http) : "n/a" },
    { label: "Source host", value: sourceHost || widget.source },
    { label: "Final URL host", value: finalHost || "n/a" },
    { label: "Probe host", value: sourceHostUsed || "n/a" },
    { label: "Freshness", value: freshness === "n/a" ? "timestamp unavailable" : `updated ${freshness} ago` },
    { label: "Coverage", value: `${usableCount}/${totalCount} usable rows` },
    { label: "Provider", value: `${widget.status} via ${widget.source}` },
  ];
}

function providerHealthState(debug: ProviderDebug): "live" | "degraded" | "empty" {
  const status = (debug.status || "").toUpperCase();
  if (status === "LIVE" || status === "REFRESH") return "live";
  if (status === "INDICATIVE" || status === "CONSTRAINED" || status === "FALLBACK") return "degraded";
  return "empty";
}

function providerRationale(debug: ProviderDebug): string {
  const mapped = typeof debug.mappedCount === "number" ? debug.mappedCount : 0;
  const err = debug.lastError?.errorKind || "none";
  if (mapped > 0 && (debug.status || "").toUpperCase() === "REFRESH") return "live mapped rows";
  if (mapped > 0) return `mapped rows with ${String(debug.status || "degraded").toLowerCase()} mode`;
  if (err !== "none") return `no rows: ${String(err).toLowerCase()}`;
  return "no mapped rows in latest fetch";
}

function inferRenderMode(widget: GridWidget): RenderMode {
  const state = widgetDataState(widget);
  if (state === "empty" || state === "degraded") return "list";
  const cardType = inferCardType(widget);
  if (cardType === "news") return "list";
  if (cardType === "health") return "bar";
  if (cardType === "table") return "list";
  if (widget.id.startsWith("TXT_")) return "list";
  const hasSeries = widget.metrics.some((metric) => Array.isArray(metric.series) && metric.series.length >= 2);
  if (hasSeries) return "spark";
  const numericValueCount = widget.metrics
    .map((metric) => parseMetricNumber(metric.value))
    .filter((value): value is number => value !== null).length;
  const deltaCount = widget.metrics.filter((metric) => typeof metric.delta === "number").length;
  if (widget.topic === "logistics") return "bar";
  if (widget.topic === "policy") return "list";
  if (deltaCount >= 1 && numericValueCount >= 2) return "bar";
  if (deltaCount >= 2) return "spark";
  if (numericValueCount >= 3) return "bar";
  return "metric";
}

function inferCardType(widget: GridWidget): CardType {
  if (widget.id.startsWith("TXT_")) return "news";
  if (widget.id.startsWith("LG_") || isDegradedStatus(widget.status) || widgetDataState(widget) !== "live") return "health";
  const hasSeries = widget.metrics.some((metric) => Array.isArray(metric.series) && metric.series.length >= 2);
  const numericValueCount = widget.metrics
    .map((metric) => parseMetricNumber(metric.value))
    .filter((value): value is number => value !== null).length;
  if (hasSeries) return "quote";
  if (numericValueCount >= 2 && widget.metrics.length >= 3) return "table";
  return "quote";
}

function cardPlacementPriority(widget: GridWidget) {
  const type = inferCardType(widget);
  if (type === "table") return 4;
  if (type === "news") return 3;
  if (type === "quote") return 2;
  return 1;
}

function topicPlacementPriority(topic: MonitorTopic) {
  if (topic === "markets") return 4;
  if (topic === "logistics") return 3;
  if (topic === "policy") return 2;
  if (topic === "weather") return 1;
  return 0;
}

function widgetAutoPackScore(widget: GridWidget) {
  const cardType = inferCardType(widget);
  const dataState = widgetDataState(widget);
  const usableCount = widget.metrics.filter(metricLooksUsable).length;
  const hrefCount = widget.metrics.filter((metric) => Boolean(metric.href)).length;
  const maxDelta = Math.max(...widget.metrics.map((metric) => Math.abs(metric.delta || 0)), 0);
  const now = Date.now();
  const ts = parseTimestamp(widget.updatedAt);
  const ageMinutes = ts == null ? 24 * 60 : Math.max(0, Math.floor((now - ts) / 60000));
  const freshnessBoost = Math.max(0, 32 - Math.min(32, ageMinutes / 8));
  let score = 0;
  if (dataState === "live") score += 130;
  else if (dataState === "degraded") score += 70;
  else score += 20;
  score += topicPlacementPriority(widget.topic) * 8;
  score += cardPlacementPriority(widget) * 12;
  score += freshnessBoost;
  score += Math.min(24, usableCount * 4);
  score += Math.min(18, hrefCount * 3);
  score += Math.min(24, maxDelta * 10);
  if (cardType === "news" || cardType === "table") {
    score += dataState === "live" ? 28 : 8;
  }
  return score;
}

function widgetHeroPriorityScore(widget: GridWidget) {
  const state = widgetDataState(widget);
  let score = widgetAutoPackScore(widget);
  if (state === "live") score += 60;
  if (state === "degraded") score += 8;
  if (state === "empty") score -= 36;
  if (isIndexCardStale(widget)) score -= 42;
  return score;
}

function cardTypeTone(cardType: CardType) {
  if (cardType === "quote") return "border-cyan-500/60 bg-cyan-500/10 text-cyan-300";
  if (cardType === "table") return "border-violet-500/60 bg-violet-500/10 text-violet-300";
  if (cardType === "news") return "border-amber-500/60 bg-amber-500/10 text-amber-300";
  return "border-rose-500/60 bg-rose-500/10 text-rose-300";
}

function metricPriority(metric: { label: string; value: string; delta?: number; href?: string }, cardType: CardType) {
  const label = (metric.label || "").toLowerCase();
  const value = (metric.value || "").toLowerCase();
  const numeric = parseMetricNumber(metric.value) !== null;
  const staticish =
    /^(note|provider|state|freshness|coverage|territory|updated|source host|http|error kind)$/.test(label) ||
    /no usable|payload without|timestamp unavailable/.test(value);
  let score = 0;
  if (numeric) score += 40;
  if (typeof metric.delta === "number") score += 14;
  if (metric.href) score += 10;
  if (!staticish) score += 16;
  if (metricLooksUsable(metric)) score += 12;
  if (cardType === "news" && metric.href) score += 14;
  if (cardType === "table" && numeric) score += 12;
  return score;
}

function prioritizeMetricsForCard(
  metrics: Array<{ label: string; value: string; delta?: number; deltaFormat?: "pct" | "abs"; href?: string; series?: number[] }>,
  cardType: CardType,
) {
  return [...metrics].sort((a, b) => metricPriority(b, cardType) - metricPriority(a, cardType));
}

function parseMetricNumber(value: string): number | null {
  const match = value.replace(/,/g, ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number.parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

function miniSparkValues(widget: GridWidget): number[] {
  const fromSeries = widget.metrics.find((metric) => Array.isArray(metric.series) && metric.series.length >= 2)?.series;
  if (fromSeries && fromSeries.length >= 2) return fromSeries.slice(-16);
  const fromDelta = widget.metrics
    .map((metric) => (typeof metric.delta === "number" ? metric.delta : null))
    .filter((value): value is number => value !== null);
  if (fromDelta.length >= 2) return fromDelta;
  const fromValue = widget.metrics
    .map((metric) => parseMetricNumber(metric.value))
    .filter((value): value is number => value !== null);
  if (fromValue.length >= 2) return fromValue;
  return [0, 0, 0];
}

function formatTimeInZone(zone: string): { time: string; date: string } {
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: zone,
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    weekday: "short",
    timeZone: zone,
  }).format(now);
  return { time, date };
}

function formatFxPair(pair: string, rates: FxResponse["rates"]): string {
  const [base, quote] = pair.split("/");
  const map = Object.fromEntries((rates || []).map((row) => [row.currency, row.usdPerUnit]));
  const usd = 1;
  const toUsd = (currency: string): number | null => {
    if (currency === "USD") return usd;
    const v = map[currency];
    return typeof v === "number" && v > 0 ? v : null;
  };
  const baseUsd = toUsd(base);
  const quoteUsd = toUsd(quote);
  if (!baseUsd || !quoteUsd) return "n/a";
  const cross = baseUsd / quoteUsd;
  return cross.toFixed(4);
}

function newsTopics(item: NewsItem): string[] {
  return (item.topic_tags || []).map((tag) => tag.toLowerCase());
}

function inferNewsTopic(item: NewsItem): MonitorTopic {
  const tags = newsTopics(item);
  if (tags.includes("logistics")) return "logistics";
  if (tags.includes("policy")) return "policy";
  if (tags.includes("weather")) return "weather";
  if (tags.includes("markets") || tags.includes("trade")) return "markets";
  return "all";
}

function newsMatchesCountry(item: NewsItem, country: Country) {
  const haystack = `${item.title} ${item.summary || ""}`.toLowerCase();
  const hints = COUNTRY_NEWS_HINTS[country] || [];
  return hints.some((hint) => haystack.includes(hint));
}

function applyCountryFallbackFilter(items: NewsItem[], country: Country): NewsItem[] {
  const strict = items.filter((item) => newsMatchesCountry(item, country));
  if (strict.length > 0) return strict;
  return items;
}

function newsMatchesRole(item: NewsItem, role: MonitorRole) {
  if (role === "all") return true;
  const topic = inferNewsTopic(item);
  if (role === "farmer") return topic === "markets" || topic === "weather" || topic === "policy" || topic === "all";
  if (role === "trader") return topic === "markets" || topic === "logistics" || topic === "policy" || topic === "all";
  return topic === "logistics" || topic === "policy" || topic === "markets" || topic === "all";
}

function newsMatchesTopic(item: NewsItem, topic: MonitorTopic) {
  if (topic === "all") return true;
  const tags = newsTopics(item);
  if (tags.includes(topic)) return true;
  return inferNewsTopic(item) === topic;
}

function buildTopicNewsMetrics(items: NewsItem[], topic: MonitorTopic, fallbackLabel: string) {
  const scoped = items.filter((item) => inferNewsTopic(item) === topic || newsTopics(item).includes(topic)).slice(0, 7);
  if (scoped.length === 0) return [{ label: fallbackLabel, value: "No headlines in current window" }];
  return scoped.map((item) => {
    const age = formatAgeShort(item.published_at);
    const summary = String(item.summary || "").replace(/\s+/g, " ").trim();
    const rationale = summary || `${item.source_name || "Source"} • ${age}`;
    return {
      label: item.title || fallbackLabel,
      value: rationale,
      href: item.url,
    };
  });
}

function getGridColumnCount(width: number) {
  if (width >= 1536) return 5; // 2xl
  if (width >= 1280) return 4; // xl
  if (width >= 768) return 2; // md
  return 1;
}

function nextRenderMode(current: RenderModeOverride): RenderModeOverride {
  const order: RenderModeOverride[] = ["auto", "metric", "spark", "bar", "list"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

function modeForPreset(widget: GridWidget, preset: RenderPreset): RenderModeOverride {
  if (preset === "mixed") return "auto";
  if (preset === "headlines") {
    if (widget.topic === "policy" || widget.topic === "weather") return "list";
    if (widget.topic === "logistics") return "list";
    return "metric";
  }
  if (widget.topic === "logistics") return "bar";
  if (widget.topic === "policy") return "list";
  if (widget.topic === "weather") return "bar";
  const hasDelta = widget.metrics.some((metric) => typeof metric.delta === "number");
  return hasDelta ? "spark" : "metric";
}

function buildMiniSparkPoints(series: number[]) {
  if (!Array.isArray(series) || series.length < 2) return "";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const normalized = series.map((value) => (max === min ? 50 : ((value - min) / (max - min)) * 100));
  return normalized.map((value, idx) => `${idx * (100 / Math.max(1, normalized.length - 1))},${100 - value}`).join(" ");
}

function normalizeToUsdTon(args: {
  current?: number;
  unit?: string;
  currency?: string;
  valueText?: string;
  rates?: Array<{ currency: string; usdPerUnit: number }>;
}) {
  const current = typeof args.current === "number" ? args.current : null;
  const unitFromField = String(args.unit || "").toLowerCase();
  const unitFromTextMatch = (args.valueText || "").match(/\/\s*([a-z]+)/i);
  const unitFromText = (unitFromTextMatch?.[1] || "").toLowerCase();
  const unit = unitFromField || unitFromText;
  const currencyRaw = String(args.currency || "").toUpperCase();
  const currencyFromText = (args.valueText || "").match(/\b([A-Z]{3})\s*\/\s*kg\b/i)?.[1]?.toUpperCase();
  const currencyFromTextGeneric = (args.valueText || "").match(/\b([A-Z]{3})\s*\/\s*[a-z]+\b/i)?.[1]?.toUpperCase();
  const currency = currencyRaw || currencyFromText || currencyFromTextGeneric || "";
  const liveUsdPerUnit = args.rates?.find((rate) => String(rate.currency).toUpperCase() === currency)?.usdPerUnit;
  const usdPerUnit = liveUsdPerUnit ?? (currency === "UAH" ? 0.024 : null);
  if (current == null || !currency || !usdPerUnit) return null;
  if (unit.includes("kg")) {
    return Number((current * 1000 * usdPerUnit).toFixed(2));
  }
  if (unit.includes("ton") || unit.includes("/t")) {
    return Number((current * usdPerUnit).toFixed(2));
  }
  return null;
}

export default function MonitorV3Page() {
  const { theme, setTheme } = useTheme();

  const [role, setRole] = useState<MonitorRole>(() => readJson<MonitorRole>(STORAGE_KEYS.role, "all"));
  const [topic, setTopic] = useState<MonitorTopic>(() => readJson<MonitorTopic>(STORAGE_KEYS.topic, "all"));
  const [country, setCountry] = useState<Country>(() => readJson<Country>(STORAGE_KEYS.country, "US"));
  const [grouping, setGrouping] = useState<GridGrouping>(() => readJson<GridGrouping>(STORAGE_KEYS.grouping, "manual"));
  const [sortMode, setSortMode] = useState<GridSort>(() => readJson<GridSort>(STORAGE_KEYS.sort, "default"));
  const [showHidden, setShowHidden] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1536 : window.innerWidth,
  );
  const [renderPreset, setRenderPreset] = useState<RenderPreset>("mixed");
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const forceRefreshWidgetsRef = useRef(false);

  const [order, setOrder] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.order, []));
  const [layoutById, setLayoutById] = useState<Record<string, GridLayout>>(() => readJson<Record<string, GridLayout>>(STORAGE_KEYS.layout, {}));
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.hidden, []));
  const [customWidgets, setCustomWidgets] = useState<GridWidget[]>(() => readJson<GridWidget[]>(STORAGE_KEYS.custom, []));
  const [clockZones, setClockZones] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.clockZones, ["UTC", "Europe/Paris", "America/New_York"]));
  const [fxPairs, setFxPairs] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.fxPairs, ["EUR/USD", "USD/BRL"]));
  const [renderModeById, setRenderModeById] = useState<Record<string, RenderModeOverride>>(() =>
    readJson<Record<string, RenderModeOverride>>(STORAGE_KEYS.renderModes, {}),
  );
  const [heroPins, setHeroPins] = useState<string[]>(() => readJson<string[]>(STORAGE_KEYS.heroPins, []));
  const [showOnlyLive, setShowOnlyLive] = useState<boolean>(() => readJson<boolean>(STORAGE_KEYS.liveOnly, false));
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(() => readJson<HealthFilter>(STORAGE_KEYS.healthFilter, "all"));
  const [pinDenseTop, setPinDenseTop] = useState<boolean>(() => readJson<boolean>(STORAGE_KEYS.pinDenseTop, true));
  const [showHealthDetails, setShowHealthDetails] = useState<boolean>(false);
  const [showHealthPanel, setShowHealthPanel] = useState<boolean>(false);
  const [directPredictionSort, setDirectPredictionSort] = useState<DirectPredictionSort>(() =>
    readJson<DirectPredictionSort>(STORAGE_KEYS.directPredictionSort, "liquidity"),
  );
  const [directPredictionRegion, setDirectPredictionRegion] = useState<DirectPredictionRegion>(() =>
    readJson<DirectPredictionRegion>(STORAGE_KEYS.directPredictionRegion, "ALL"),
  );
  const [yieldCrop, setYieldCrop] = useState<YieldCropFilter>(() => readJson<YieldCropFilter>(STORAGE_KEYS.yieldCrop, "ALL"));
  const [videoTopic, setVideoTopic] = useState<VideoTopic>(() => readJson<VideoTopic>(STORAGE_KEYS.videoTopic, "all"));
  const [videoChannel, setVideoChannel] = useState<string>(() => readJson<string>(STORAGE_KEYS.videoChannel, "all"));
  const [mapVideoSourceId, setMapVideoSourceId] = useState<string | null>(null);
  const [debugWidgetId, setDebugWidgetId] = useState<string | null>(null);
  const [debugProviderId, setDebugProviderId] = useState<string | null>(null);
  const [geoLayers, setGeoLayers] = useState<Record<GeoLayerId, boolean>>({
    markets: true,
    logistics: true,
    weather: true,
    risk: true,
  });
  const [geoZoom, setGeoZoom] = useState(1);
  const [geoPan, setGeoPan] = useState({ x: 0, y: 0 });
  const [geoDragging, setGeoDragging] = useState(false);
  const [geoHoverPointId, setGeoHoverPointId] = useState<string | null>(null);
  const geoDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const [draft, setDraft] = useState<CustomWidgetDraft>({ title: "", subtitle: "", source: "", topic: "markets" });
  const [selectedMetric, setSelectedMetric] = useState<{
    widgetTitle: string;
    widgetSource: string;
    widgetStatus: string;
    metricLabel: string;
    metricValue: string;
    metricDelta?: number;
    metricDeltaFormat?: "pct" | "abs";
    href?: string;
  } | null>(null);

  useEffect(() => writeJson(STORAGE_KEYS.role, role), [role]);
  useEffect(() => writeJson(STORAGE_KEYS.topic, topic), [topic]);
  useEffect(() => writeJson(STORAGE_KEYS.country, country), [country]);
  useEffect(() => writeJson(STORAGE_KEYS.grouping, grouping), [grouping]);
  useEffect(() => writeJson(STORAGE_KEYS.sort, sortMode), [sortMode]);
  useEffect(() => writeJson(STORAGE_KEYS.order, order), [order]);
  useEffect(() => writeJson(STORAGE_KEYS.layout, layoutById), [layoutById]);
  useEffect(() => writeJson(STORAGE_KEYS.hidden, hiddenIds), [hiddenIds]);
  useEffect(() => writeJson(STORAGE_KEYS.custom, customWidgets), [customWidgets]);
  useEffect(() => writeJson(STORAGE_KEYS.clockZones, clockZones), [clockZones]);
  useEffect(() => writeJson(STORAGE_KEYS.fxPairs, fxPairs), [fxPairs]);
  useEffect(() => writeJson(STORAGE_KEYS.renderModes, renderModeById), [renderModeById]);
  useEffect(() => writeJson(STORAGE_KEYS.heroPins, heroPins), [heroPins]);
  useEffect(() => writeJson(STORAGE_KEYS.liveOnly, showOnlyLive), [showOnlyLive]);
  useEffect(() => writeJson(STORAGE_KEYS.healthFilter, healthFilter), [healthFilter]);
  useEffect(() => writeJson(STORAGE_KEYS.pinDenseTop, pinDenseTop), [pinDenseTop]);
  useEffect(() => writeJson(STORAGE_KEYS.directPredictionSort, directPredictionSort), [directPredictionSort]);
  useEffect(() => writeJson(STORAGE_KEYS.directPredictionRegion, directPredictionRegion), [directPredictionRegion]);
  useEffect(() => writeJson(STORAGE_KEYS.yieldCrop, yieldCrop), [yieldCrop]);
  useEffect(() => writeJson(STORAGE_KEYS.videoTopic, videoTopic), [videoTopic]);
  useEffect(() => writeJson(STORAGE_KEYS.videoChannel, videoChannel), [videoChannel]);

  const newsQuery = useQuery<NewsResponse>({
    queryKey: ["monitor-v3-news"],
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/news?crop=all&topic=all&region=all&time=24h&threshold=3");
      if (!response.ok) throw new Error("Failed to load monitor news");
      return response.json();
    },
  });

  const grainWidgetsQuery = useQuery<GrainWidgetsResponse>({
    queryKey: ["monitor-v3-grain-widgets", country],
    staleTime: 90_000,
    queryFn: async () => {
      const refreshBit = forceRefreshWidgetsRef.current ? "&refresh=1" : "";
      const response = await fetch(`/api/monitor/grain-widgets?country=${country}${refreshBit}`);
      forceRefreshWidgetsRef.current = false;
      if (!response.ok) throw new Error("Failed to load grain widgets");
      return response.json();
    },
  });

  const grainMarketsQuery = useQuery<GrainMarketsResponse>({
    queryKey: ["monitor-v3-grain-markets"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/grain-markets");
      if (!response.ok) throw new Error("Failed to load grain markets");
      return response.json();
    },
  });

  const logisticsQuery = useQuery<LogisticsIndicatorsResponse>({
    queryKey: ["monitor-v3-logistics-indicators"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/logistics-indicators");
      if (!response.ok) throw new Error("Failed to load logistics indicators");
      return response.json();
    },
  });

  const indicesQuery = useQuery<IndicesResponse>({
    queryKey: ["monitor-v3-indices"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/indices");
      if (!response.ok) throw new Error("Failed to load monitor indices");
      return response.json();
    },
  });
  const fxQuery = useQuery<FxResponse>({
    queryKey: ["monitor-v3-fx"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/macro-fx");
      if (!response.ok) throw new Error("Failed to load macro fx");
      return response.json();
    },
  });
  const activationQuery = useQuery<ActivationReportResponse>({
    queryKey: ["monitor-v3-activation"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/activation-report");
      if (!response.ok) throw new Error("Failed to load activation report");
      return response.json();
    },
  });
  const predictionMarketsQuery = useQuery<PredictionMarketsResponse>({
    queryKey: ["monitor-v3-prediction-markets"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/prediction-markets");
      if (!response.ok) throw new Error("Failed to load prediction markets");
      return response.json();
    },
  });
  const predictionTrendsQuery = useQuery<PredictionRiskTrendsResponse>({
    queryKey: ["monitor-v3-prediction-risk-trends"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/prediction-risk-trends?hours=168");
      if (!response.ok) throw new Error("Failed to load prediction risk trends");
      return response.json();
    },
  });
  const agroExpectationsQuery = useQuery<AgroExpectationsResponse>({
    queryKey: ["monitor-v3-agro-expectations"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/agro-expectations");
      if (!response.ok) throw new Error("Failed to load agro expectations");
      return response.json();
    },
  });
  const agroCompositeTrendsQuery = useQuery<AgroCompositeTrendsResponse>({
    queryKey: ["monitor-v3-agro-composite-trends", "GLOBAL"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/agro-composite-trends?hours=168&region=GLOBAL");
      if (!response.ok) throw new Error("Failed to load agro composite trends");
      return response.json();
    },
  });
  const cgoWeightsQuery = useQuery<CgoWeightsResponse>({
    queryKey: ["monitor-v3-cgo-weights", "GLOBAL"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const year = new Date().getUTCFullYear();
      const response = await fetch(`/api/monitor/cgo-weights?year=${year}&region=GLOBAL`);
      if (!response.ok) throw new Error("Failed to load cgo weights");
      return response.json();
    },
  });
  const binanceSnapshotQuery = useQuery<BinanceSnapshotResponse>({
    queryKey: ["monitor-v3-binance-snapshot"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/binance-snapshot");
      if (!response.ok) throw new Error("Failed to load binance snapshot");
      return response.json();
    },
  });
  const binanceRiskTrendsQuery = useQuery<BinanceRiskTrendsResponse>({
    queryKey: ["monitor-v3-binance-risk-trends"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/binance-risk-trends?hours=168");
      if (!response.ok) throw new Error("Failed to load binance risk trends");
      return response.json();
    },
  });
  const globalIndicesQuery = useQuery<GlobalIndicesResponse>({
    queryKey: ["monitor-v3-global-indices"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/global-indices");
      if (!response.ok) throw new Error("Failed to load global indices");
      return response.json();
    },
  });
  const globalIndicesTrendsQuery = useQuery<GlobalIndicesTrendsResponse>({
    queryKey: ["monitor-v3-global-indices-trends"],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch("/api/monitor/global-indices-trends?hours=168");
      if (!response.ok) throw new Error("Failed to load global indices trends");
      return response.json();
    },
  });
  const yieldFoodSecurityQuery = useQuery<YieldFoodSecurityResponse>({
    queryKey: ["monitor-v3-yield-food-security", country, yieldCrop],
    staleTime: 90_000,
    queryFn: async () => {
      const response = await fetch(`/api/monitor/yield-food-security?country=${encodeURIComponent(country)}&crop=${encodeURIComponent(yieldCrop)}`);
      if (!response.ok) throw new Error("Failed to load yield & food security");
      return response.json();
    },
  });
  const providerById = useMemo(
    () => Object.fromEntries((activationQuery.data?.providers || []).map((provider) => [provider.providerId, provider])),
    [activationQuery.data],
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const coreWidgets = useMemo<GridWidget[]>(() => {
    const targetedConstrainedProviders = new Set([
      "oecd-agricultural-outlook",
      "wfp-databridges",
      "faostat-pp",
      "fpma-market-prices",
      "usda-psd",
    ]);
    const deriveStatus = (currentStatus: string | undefined, providerId?: string): string => {
      const status = (currentStatus || "OFFLINE").toUpperCase();
      if (!providerId || !targetedConstrainedProviders.has(providerId)) return status;
      const provider = providerById[providerId];
      if (!provider) return status;
      if (status === "REFRESH" || status === "LIVE") return status;
      const mapped = typeof provider.mappedCount === "number" ? provider.mappedCount : 0;
      return mapped > 0 ? "INDICATIVE" : "CONSTRAINED";
    };
    const byKind = grainWidgetsQuery.data?.widgets?.byKind || {};
    const orderFromResponse = grainWidgetsQuery.data?.widgets?.order || Object.keys(byKind);
    const feedItems = newsQuery.data?.feed || [];
    const topSignalItems = newsQuery.data?.topSignals || [];

    const widgetsFromExpansion: GridWidget[] = orderFromResponse
      .map((kind) => {
        const widget = byKind[kind];
        if (!widget) return null;
        const providerId = WIDGET_KIND_TO_PROVIDER[kind];
        const effectiveStatus = deriveStatus(widget.status, providerId);
        const numericMetrics = pickMetrics(widget);
        const metrics = numericMetrics.length > 0 ? numericMetrics : pickFallbackMetrics(widget);
        return {
          id: `GW_${kind}`,
          title: labelFromKind(kind),
          subtitle: widget.notes?.[0] || "Expansion widget",
          status: effectiveStatus,
          source: widget.sourceName || "Unknown",
          updatedAt: widget.updatedAt,
          topic: KIND_TO_TOPIC[kind] || "markets",
          roles: KIND_TO_ROLES[kind] || ["farmer", "trader", "broker"],
          territory: widget.territory?.code || "GLOBAL",
          metrics: metrics.map((m) => ({ ...m, href: widget.sourceUrl })),
        } as GridWidget;
      })
      .filter((item): item is GridWidget => Boolean(item));

    const marketRows = [...(grainMarketsQuery.data?.widgets?.cbot || []), ...(grainMarketsQuery.data?.widgets?.euronext || [])];
    const widgetsFromMarkets: GridWidget[] = marketRows.map((row) => ({
      id: `GM_${row.instrumentKey}`,
      title: row.title,
      subtitle: row.subtitle || "Core market instrument",
      status: row.status || "OFFLINE",
      source: row.sourceName || "Unknown",
      updatedAt: undefined,
      topic: "markets",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: [{ label: "Price", value: formatMetric(row.valueCurrent, `${row.currency || ""}/${row.unit || ""}`), delta: row.valueChangePct, href: row.sourceUrl }],
    }));

    const widgetsFromLogistics: GridWidget[] = (logisticsQuery.data?.widgets || []).map((row) => ({
      id: `LG_${row.id}`,
      title: row.title,
      subtitle: row.subtitle,
      status: row.status || "OFFLINE",
      source: row.sourceName,
      updatedAt: undefined,
      topic: "logistics",
      roles: ["trader", "broker", "farmer"],
      territory: "GLOBAL",
      metrics: [{ label: "Current", value: formatMetric(row.valueCurrent, row.unit), delta: row.valueChangePct, href: row.sourceUrl }],
    }));

    const widgetsFromIndices: GridWidget[] = (indicesQuery.data?.items || []).slice(0, 6).map((row) => ({
      id: `IDX_${row.slug}`,
      title: row.name,
      subtitle: "Composite index",
      status: "REFRESH",
      source: row.source || "Index source",
      updatedAt: row.updatedAt,
      topic: "markets",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: [{ label: "Index", value: formatMetric(row.value, "pts"), delta: row.change, deltaFormat: "abs" }],
    }));

    const topSignalsWidget: GridWidget = {
      id: "TXT_TOP_SIGNALS",
      title: "Signal Headlines",
      subtitle: "Top decision-relevant RSS signals",
      status: "REFRESH",
      source: "Monitor news",
      updatedAt: newsQuery.data?.generatedAt,
      topic: "policy",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics:
        topSignalItems.length > 0
          ? topSignalItems.slice(0, 5).map((item) => ({
              label: item.title || "Signal headline",
              value: String(item.summary || "").replace(/\s+/g, " ").trim() || `${item.source_name || "Source"} • ${formatAgeShort(item.published_at)}`,
              href: item.url,
            }))
          : [{ label: "Signals", value: "No signal headlines yet" }],
    };

    const logisticsFeedWidget: GridWidget = {
      id: "TXT_LOGISTICS_FEED",
      title: "Logistics Feed",
      subtitle: "Port, freight and corridor headlines",
      status: "REFRESH",
      source: "Monitor news",
      updatedAt: newsQuery.data?.generatedAt,
      topic: "logistics",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: (() => {
        const logisticsItems = feedItems.filter((item) => newsTopics(item).includes("logistics")).slice(0, 5);
        if (logisticsItems.length === 0) return [{ label: "Feed", value: "No logistics headlines for current window" }];
        return logisticsItems.map((item) => ({
          label: item.title || "Logistics headline",
          value: String(item.summary || "").replace(/\s+/g, " ").trim() || `${item.source_name || "Source"} • ${formatAgeShort(item.published_at)}`,
          href: item.url,
        }));
      })(),
    };

    const marketsFeedWidget: GridWidget = {
      id: "TXT_MARKETS_FEED",
      title: "Markets Headlines",
      subtitle: "Commodity and basis-related flow",
      status: "REFRESH",
      source: "Monitor news",
      updatedAt: newsQuery.data?.generatedAt,
      topic: "markets",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: buildTopicNewsMetrics(feedItems, "markets", "Markets feed"),
    };

    const policyFeedWidget: GridWidget = {
      id: "TXT_POLICY_FEED",
      title: "Policy Headlines",
      subtitle: "Regulation and trade policy flow",
      status: "REFRESH",
      source: "Monitor news",
      updatedAt: newsQuery.data?.generatedAt,
      topic: "policy",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: buildTopicNewsMetrics(feedItems, "policy", "Policy feed"),
    };

    const weatherFeedWidget: GridWidget = {
      id: "TXT_WEATHER_FEED",
      title: "Weather Headlines",
      subtitle: "Weather risk and crop-condition flow",
      status: "REFRESH",
      source: "Monitor news",
      updatedAt: newsQuery.data?.generatedAt,
      topic: "weather",
      roles: ["farmer", "trader", "broker"],
      territory: "GLOBAL",
      metrics: buildTopicNewsMetrics(feedItems, "weather", "Weather feed"),
    };

    const sentimentCandidates = (indicesQuery.data?.items || []).filter((row) => {
      const key = `${row.slug} ${row.name}`.toLowerCase();
      return key.includes("btc") || key.includes("bitcoin") || key.includes("gold") || key.includes("oil") || key.includes("brent") || key.includes("wti");
    });
    const sentimentItems = sentimentCandidates.slice(0, 3);
    const marketSentimentFallback = marketRows
      .filter((row) => /corn|wheat|soy|rapeseed/i.test(`${row.title} ${row.subtitle || ""}`))
      .slice(0, 3);
    const directPredictionRows = (predictionMarketsQuery.data?.directGrainMarkets || [])
      .filter((row) => directPredictionRegion === "ALL" || row.region === directPredictionRegion)
      .sort((a, b) => {
        if (directPredictionSort === "volume") return (b.volume24h || 0) - (a.volume24h || 0);
        if (directPredictionSort === "quality") return (b.qualityScore || 0) - (a.qualityScore || 0);
        return (b.liquidityScore || 0) - (a.liquidityScore || 0);
      });
    const binanceRows = binanceSnapshotQuery.data?.rows || [];
    const binanceCommodityRows = binanceRows.filter((row) => row.assetType === "token_commodity");
    const binanceMajorRows = binanceRows.filter((row) => ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"].includes(row.symbol));
    const btcOptionsRow = binanceRows.find((row) => row.symbol === "BTC_OPTIONS");
    const ethOptionsRow = binanceRows.find((row) => row.symbol === "ETH_OPTIONS");
    const btcRiskTrend = binanceRiskTrendsQuery.data?.bySymbol?.BTCUSDT;
    const ethRiskTrend = binanceRiskTrendsQuery.data?.bySymbol?.ETHUSDT;
    const globalIndicesRows = globalIndicesQuery.data?.rows || [];
    const globalIndicesStatus = (globalIndicesQuery.data?.status || "CONSTRAINED").toUpperCase();
    const riskOnOff = globalIndicesQuery.data?.riskOnOff;
    const eurUsd = formatFxPair("EUR/USD", fxQuery.data?.rates);
    const usdBrl = formatFxPair("USD/BRL", fxQuery.data?.rates);
    const globalTrendSpx = globalIndicesTrendsQuery.data?.bySymbol?.SPX?.points?.map((point) => point.value) || [];
    const globalTrendIxic = globalIndicesTrendsQuery.data?.bySymbol?.IXIC?.points?.map((point) => point.value) || [];
    const matrixSeries = globalTrendSpx.length >= 2 && globalTrendIxic.length >= 2
      ? globalTrendSpx
          .slice(-Math.min(globalTrendSpx.length, globalTrendIxic.length))
          .map((point, idx) => {
            const left = point;
            const right = globalTrendIxic[globalTrendIxic.length - Math.min(globalTrendSpx.length, globalTrendIxic.length) + idx];
            return Number((((left + right) / 2)).toFixed(4));
          })
      : undefined;

    const widgetsFromGlobalContext: GridWidget[] = [
      {
        id: "SYS_WORLD_CLOCK",
        title: "World Clock",
        subtitle: "Reference timezone snapshot",
        status: "REFRESH",
        source: "Cropto system",
        topic: "policy",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: clockZones.slice(0, 3).map((zone) => {
          const current = formatTimeInZone(zone);
          return { label: zone, value: current.time };
        }),
      },
      {
        id: "SYS_FX_PAIRS",
        title: "FX Pairs",
        subtitle: "Cross rates for macro context",
        status: fxQuery.data?.mode === "live" ? "REFRESH" : "INDICATIVE",
        source: "Monitor FX",
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: fxPairs.slice(0, 2).map((pair) => ({ label: pair, value: formatFxPair(pair, fxQuery.data?.rates) })),
      },
      {
        id: "SYS_MARKET_SENTIMENT",
        title: "Market Sentiment",
        subtitle: "Prediction + Binance macro risk layer",
        status: (predictionMarketsQuery.data?.indices?.length || 0) > 0 ? "REFRESH" : (sentimentItems.length ? "INDICATIVE" : "OFFLINE"),
        source: "Kalshi + Polymarket",
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: (predictionMarketsQuery.data?.indices || []).length > 0
          ? (predictionMarketsQuery.data?.indices || []).map((item) => ({
              label: item.label,
              value: item.value != null ? `${(item.value * 100).toFixed(1)}%` : "n/a",
              delta: undefined,
            }))
          : sentimentItems.length
            ? sentimentItems.map((item) => ({ label: item.name, value: formatMetric(item.value, "pts"), delta: item.change }))
            : marketSentimentFallback.length
            ? marketSentimentFallback.map((item) => ({
                label: item.title,
                value: formatMetric(item.valueCurrent, `${item.currency || ""}/${item.unit || ""}`),
                delta: item.valueChangePct,
              }))
            : [{ label: "Sentiment feed", value: "No live BTC/Gold/Oil series (constrained)" }],
      },
      {
        id: "SYS_GLOBAL_INDICES",
        title: "Global Indices",
        subtitle: "US/EU/EM benchmark snapshot",
        status: globalIndicesStatus,
        source: globalIndicesQuery.data?.providerMode === "twelvedata" ? "Twelve Data" : "Fallback baseline",
        updatedAt: globalIndicesQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: globalIndicesRows.length > 0
          ? globalIndicesRows.slice(0, 8).map((row) => ({
              label: row.name,
              value: typeof row.value === "number" ? row.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "n/a",
              delta: typeof row.dayChangePct === "number" ? row.dayChangePct : undefined,
              series: Array.isArray(row.series) && row.series.length >= 2 ? row.series : undefined,
            }))
          : [{ label: "State", value: "No global index rows available" }],
      },
      {
        id: "SYS_GLOBAL_RISK_ON_OFF",
        title: "Global Risk On/Off",
        subtitle: "Equities + cross-asset directional matrix",
        status: globalIndicesStatus,
        source: "Global indices layer",
        updatedAt: globalIndicesQuery.data?.generatedAt,
        topic: "policy",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: riskOnOff
          ? [
              {
                label: "Regime",
                value: riskOnOff.regime.replace("_", " "),
                delta: typeof riskOnOff.score === "number" ? riskOnOff.score : undefined,
                deltaFormat: "abs" as const,
              },
              ...((riskOnOff.matrix || []).slice(0, 6).map((row) => ({
                label: row.label,
                value: row.value == null ? "n/a" : `${row.value.toFixed(2)}%`,
                delta: row.value == null ? undefined : row.value,
              }))),
            ]
          : [{ label: "State", value: "Risk-on/off matrix unavailable" }],
      },
      {
        id: "SYS_GLOBAL_LINK_MATRIX",
        title: "Global Link Matrix",
        subtitle: "Indices + BTC/Gold + FX compact linkage",
        status: globalIndicesStatus,
        source: "Cross-asset matrix",
        updatedAt: globalIndicesQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: [
          {
            label: "Regime",
            value: riskOnOff ? `${riskOnOff.regime.replace("_", " ")}${riskOnOff.score != null ? ` (${riskOnOff.score.toFixed(1)})` : ""}` : "n/a",
            delta: riskOnOff?.score ?? undefined,
            deltaFormat: "abs",
            series: matrixSeries,
          },
          {
            label: "US/EU/EM",
            value: riskOnOff?.matrix
              ? `${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "US Equities")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()} / ${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "EU Equities")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()} / ${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "EM Equities")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()}`
              : "n/a",
          },
          {
            label: "BTC/Gold",
            value: riskOnOff?.matrix
              ? `${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "BTC")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()} / ${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "Gold")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()}`
              : "n/a",
          },
          {
            label: "Oil/DXY",
            value: riskOnOff?.matrix
              ? `${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "Oil")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()} / ${(() => {
                  const v = riskOnOff.matrix?.find((item) => item.label === "DXY")?.value;
                  return v == null ? "n/a" : `${v.toFixed(2)}%`;
                })()}`
              : "n/a",
          },
          {
            label: "FX",
            value: `EUR/USD ${eurUsd} | USD/BRL ${usdBrl}`,
          },
        ],
      },
      {
        id: "SYS_BINANCE_COMMODITY_PROXY",
        title: "Binance Commodities Proxy",
        subtitle: "Tokenized commodity layer (PAXG and peers)",
        status: (binanceSnapshotQuery.data?.status || "CONSTRAINED").toUpperCase(),
        source: "Binance spot",
        updatedAt: binanceSnapshotQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: binanceCommodityRows.length > 0
          ? binanceCommodityRows.slice(0, 4).map((row) => ({
              label: row.symbol,
              value:
                typeof row.price === "number"
                  ? `${row.price.toFixed(2)} USDT | vol ${typeof row.volume24h === "number" ? Math.round(row.volume24h).toLocaleString("en-US") : "n/a"}`
                  : "n/a",
              delta: typeof row.priceChange24hPct === "number" ? row.priceChange24hPct : undefined,
              series: Array.isArray(row.series) && row.series.length >= 2 ? row.series : undefined,
            }))
          : [{ label: "Status", value: "No commodity token rows from Binance snapshot" }],
      },
      {
        id: "SYS_BINANCE_CRYPTO_MAJORS",
        title: "Binance Crypto Majors",
        subtitle: "BTC/ETH/BNB/SOL spot risk map",
        status: (binanceSnapshotQuery.data?.status || "CONSTRAINED").toUpperCase(),
        source: "Binance spot",
        updatedAt: binanceSnapshotQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: binanceMajorRows.length > 0
          ? binanceMajorRows.slice(0, 4).map((row) => ({
              label: row.symbol,
              value: typeof row.price === "number" ? `${row.price.toFixed(2)} USDT` : "n/a",
              delta: typeof row.priceChange24hPct === "number" ? row.priceChange24hPct : undefined,
              series: Array.isArray(row.series) && row.series.length >= 2 ? row.series : undefined,
            }))
          : [{ label: "Status", value: "No major crypto rows from Binance snapshot" }],
      },
      {
        id: "SYS_BINANCE_DERIV_RISK",
        title: "Binance Derivatives Risk",
        subtitle: "Options-vol proxy and macro stress breakdown",
        status: (binanceSnapshotQuery.data?.status || "CONSTRAINED").toUpperCase(),
        source: "Binance options proxy",
        updatedAt: binanceRiskTrendsQuery.data?.generatedAt || binanceSnapshotQuery.data?.generatedAt,
        topic: "policy",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: [
          {
            label: "Macro Risk Score",
            value:
              typeof binanceRiskTrendsQuery.data?.macroRisk?.score === "number"
                ? `${binanceRiskTrendsQuery.data?.macroRisk?.score.toFixed(2)} / 100`
                : typeof binanceSnapshotQuery.data?.macroRisk?.score === "number"
                  ? `${binanceSnapshotQuery.data?.macroRisk?.score.toFixed(2)} / 100`
                  : "n/a",
            series:
              Array.isArray(btcRiskTrend?.points) &&
              Array.isArray(ethRiskTrend?.points) &&
              btcRiskTrend.points.length >= 2 &&
              ethRiskTrend.points.length >= 2
                ? btcRiskTrend.points
                    .slice(-Math.min(btcRiskTrend.points.length, ethRiskTrend.points.length))
                    .map((point, idx) => {
                      const ethPoint = ethRiskTrend.points[ethRiskTrend.points.length - Math.min(btcRiskTrend.points.length, ethRiskTrend.points.length) + idx];
                      const b = typeof point?.value === "number" ? point.value : 0;
                      const e = typeof ethPoint?.value === "number" ? ethPoint.value : 0;
                      return Number((((b + e) / 2) * 100).toFixed(4));
                    })
                : undefined,
          },
          {
            label: "BTC Vol Proxy",
            value:
              typeof binanceSnapshotQuery.data?.macroRisk?.btcVolProxy === "number"
                ? `${(binanceSnapshotQuery.data?.macroRisk?.btcVolProxy * 100).toFixed(1)}%`
                : "n/a",
          },
          {
            label: "ETH Vol Proxy",
            value:
              typeof binanceSnapshotQuery.data?.macroRisk?.ethVolProxy === "number"
                ? `${(binanceSnapshotQuery.data?.macroRisk?.ethVolProxy * 100).toFixed(1)}%`
                : "n/a",
          },
          {
            label: "Options OI",
            value:
              typeof btcOptionsRow?.openInterest === "number" || typeof ethOptionsRow?.openInterest === "number"
                ? `BTC ${typeof btcOptionsRow?.openInterest === "number" ? Math.round(btcOptionsRow.openInterest).toLocaleString("en-US") : "n/a"} | ETH ${typeof ethOptionsRow?.openInterest === "number" ? Math.round(ethOptionsRow.openInterest).toLocaleString("en-US") : "n/a"}`
                : "unavailable",
          },
        ],
      },
      {
        id: "SYS_MACRO_PULSE",
        title: "Macro Pulse",
        subtitle: "Signals + prediction market pulse",
        status: (predictionMarketsQuery.data?.marketCount || 0) > 0 ? "REFRESH" : "INDICATIVE",
        source: "Cropto monitor",
        topic: "policy",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: [
          { label: "Signal volume 24h", value: String(feedItems.length) },
          { label: "Top priority count", value: String(topSignalItems.length) },
          { label: "Prediction markets", value: String(predictionMarketsQuery.data?.marketCount || 0) },
          {
            label: "Providers",
            value: `K:${predictionMarketsQuery.data?.sources?.kalshi?.count || 0} P:${predictionMarketsQuery.data?.sources?.polymarket?.count || 0}`,
          },
        ],
      },
      {
        id: "SYS_FARMER_SENTIMENT_US",
        title: "Farmer Sentiment (US)",
        subtitle: "Purdue/CME Ag Economy Barometer",
        status: (agroExpectationsQuery.data?.barometer?.status || "CONSTRAINED").toUpperCase(),
        source: agroExpectationsQuery.data?.barometer?.source || "Purdue/CME",
        updatedAt: agroExpectationsQuery.data?.generatedAt,
        topic: "policy",
        roles: ["farmer", "trader", "broker"],
        territory: "US",
        metrics: [
          {
            label: "Ag Economy",
            value:
              typeof agroExpectationsQuery.data?.barometer?.agEconomy === "number"
                ? `${agroExpectationsQuery.data?.barometer?.agEconomy.toFixed(0)} pts`
                : "n/a",
          },
          {
            label: "Current Conditions",
            value:
              typeof agroExpectationsQuery.data?.barometer?.currentConditions === "number"
                ? `${agroExpectationsQuery.data?.barometer?.currentConditions.toFixed(0)} pts`
                : "n/a",
          },
          {
            label: "Future Expectations",
            value:
              typeof agroExpectationsQuery.data?.barometer?.futureExpectations === "number"
                ? `${agroExpectationsQuery.data?.barometer?.futureExpectations.toFixed(0)} pts`
                : "n/a",
          },
        ],
      },
      {
        id: "SYS_AGRI_ETF_PROXY",
        title: "Agri ETF Proxies",
        subtitle: "CORN/WEAT/SOYB/DBA/TAGS baseline",
        status: (agroExpectationsQuery.data?.etfProxies?.status || "CONSTRAINED").toUpperCase(),
        source: "Stooq snapshot",
        updatedAt: agroExpectationsQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: (agroExpectationsQuery.data?.etfProxies?.rows || []).length
          ? (agroExpectationsQuery.data?.etfProxies?.rows || []).slice(0, 5).map((row) => ({
              label: row.symbol,
              value:
                typeof row.price === "number"
                  ? `${row.price.toFixed(2)} USD | 30d ${typeof row.d30ChangePct === "number" ? `${row.d30ChangePct >= 0 ? "+" : ""}${row.d30ChangePct.toFixed(2)}%` : "n/a"}`
                  : "n/a",
              delta: typeof row.dayChangePct === "number" ? row.dayChangePct : undefined,
              series: Array.isArray(row.series) && row.series.length >= 2 ? row.series : undefined,
            }))
          : [{ label: "Status", value: "No ETF rows yet" }],
      },
      {
        id: "SYS_CGO_COMPOSITE",
        title: "CGO Composite",
        subtitle: "40/30/30 CORN-WEAT-SOYB normalized basket",
        status: (agroExpectationsQuery.data?.etfProxies?.status || "CONSTRAINED").toUpperCase(),
        source: "Cropto composite",
        updatedAt: agroCompositeTrendsQuery.data?.generatedAt || agroExpectationsQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: [
          {
            label: "CGO Index",
            value:
              typeof agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.latest === "number"
                ? `${agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.latest.toFixed(2)} pts`
                : typeof agroExpectationsQuery.data?.etfProxies?.cgoComposite?.value === "number"
                  ? `${agroExpectationsQuery.data?.etfProxies?.cgoComposite?.value.toFixed(2)} pts`
                  : "n/a",
            delta:
              typeof agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.delta24h === "number"
                ? agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.delta24h
                : typeof agroExpectationsQuery.data?.etfProxies?.cgoComposite?.dayChangePct === "number"
                  ? agroExpectationsQuery.data?.etfProxies?.cgoComposite?.dayChangePct
                  : undefined,
            series:
              Array.isArray(agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.points) &&
              (agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.points?.length || 0) >= 2
                ? agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.points.map((point) => point.value)
                : Array.isArray(agroExpectationsQuery.data?.etfProxies?.cgoComposite?.series) &&
                    (agroExpectationsQuery.data?.etfProxies?.cgoComposite?.series?.length || 0) >= 2
                  ? agroExpectationsQuery.data?.etfProxies?.cgoComposite?.series
                  : undefined,
          },
          {
            label: "7d Delta",
            value:
              typeof agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.delta7d === "number"
                ? `${agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.delta7d >= 0 ? "+" : ""}${agroCompositeTrendsQuery.data?.byIndex?.cgo_basic?.delta7d.toFixed(2)} pts`
                : typeof agroExpectationsQuery.data?.etfProxies?.cgoComposite?.d30ChangePct === "number"
                  ? `${agroExpectationsQuery.data?.etfProxies?.cgoComposite?.d30ChangePct >= 0 ? "+" : ""}${agroExpectationsQuery.data?.etfProxies?.cgoComposite?.d30ChangePct.toFixed(2)}%`
                  : "n/a",
          },
          {
            label: "Mode",
            value: "basic 40/30/30",
          },
        ],
      },
      {
        id: "SYS_CGO_EXT",
        title: "CGO Ext (World Weights)",
        subtitle: "FAO/USDA-aligned extended proxy basket",
        status: agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.latest != null ? "INDICATIVE" : "CONSTRAINED",
        source: "Cropto composite ext",
        updatedAt: agroCompositeTrendsQuery.data?.generatedAt || agroExpectationsQuery.data?.generatedAt,
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: [
          {
            label: "CGO Ext",
            value:
              typeof agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.latest === "number"
                ? `${agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.latest.toFixed(2)} pts`
                : "n/a",
            delta:
              typeof agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.delta24h === "number"
                ? agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.delta24h
                : undefined,
            deltaFormat: "abs",
            series:
              Array.isArray(agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.points) &&
              (agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.points?.length || 0) >= 2
                ? agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.points.map((point) => point.value)
                : undefined,
          },
          {
            label: "7d Delta",
            value:
              typeof agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.delta7d === "number"
                ? `${agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.delta7d >= 0 ? "+" : ""}${agroCompositeTrendsQuery.data?.byIndex?.cgo_ext?.delta7d.toFixed(2)} pts`
                : "n/a",
          },
          {
            label: "Weights",
            value:
              (cgoWeightsQuery.data?.rows || [])
                .slice(0, 3)
                .map((row) => `${String(row.commodity).toUpperCase()}:${Math.round((row.weight || 0) * 100)}%`)
                .join(" | ") || "seed defaults",
          },
        ],
      },
      {
        id: "SYS_DIRECT_GRAIN_PREDICTION",
        title: "Direct Grain Prediction Markets",
        subtitle: "Open grain/oilseed contracts from Kalshi & Polymarket",
        status: directPredictionRows.length > 0 ? "INDICATIVE" : "OFFLINE",
        source: "Kalshi + Polymarket",
        topic: "markets",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: directPredictionRows.length > 0
          ? directPredictionRows.slice(0, 10).map((row) => ({
              label: `${row.source.toUpperCase()} ${row.region} • q${((row.qualityScore || 0) * 100).toFixed(0)}`,
              value: `${row.question} • ${row.impliedProbability.toFixed(1)}% • vol ${Math.round(row.volume24h)} • liq ${(row.liquidityScore || 0).toFixed(2)}${row.orderbookSpreadBps != null ? ` • spread ${row.orderbookSpreadBps.toFixed(0)}bps` : ""}`,
            }))
          : [{ label: "Status", value: "No direct grain prediction contracts for selected region/sort" }],
      },
      {
        id: "SYS_PREDICTION_RISK_TRENDS",
        title: "Prediction Risk Trends 24h/7d",
        subtitle: "Timeseries from persisted macro_risk_timeseries",
        status: predictionTrendsQuery.data?.byIndex ? "REFRESH" : "INDICATIVE",
        source: "Prediction timeseries",
        topic: "policy",
        roles: ["farmer", "trader", "broker"],
        territory: "GLOBAL",
        metrics: ([
          { key: "inflation_risk", label: "Inflation Risk" },
          { key: "rates_risk", label: "Rates Risk" },
          { key: "geopolitics_risk", label: "Geopolitics Risk" },
          { key: "grain_risk", label: "Grain Risk" },
        ] as const).map((item) => {
          const trend = predictionTrendsQuery.data?.byIndex?.[item.key];
          const latest = trend?.latest;
          const d24 = trend?.delta24h;
          const d7 = trend?.delta7d;
          const series = Array.isArray(trend?.points)
            ? trend?.points.map((point: { ts: string; value: number }) => Number(point.value) * 100).filter(Number.isFinite)
            : [];
          const parts: string[] = [];
          if (latest != null && Number.isFinite(latest)) parts.push(`${(latest * 100).toFixed(1)}%`);
          if (d24 != null && Number.isFinite(d24)) parts.push(`24h ${d24 >= 0 ? "+" : ""}${(d24 * 100).toFixed(1)}pp`);
          if (d7 != null && Number.isFinite(d7)) parts.push(`7d ${d7 >= 0 ? "+" : ""}${(d7 * 100).toFixed(1)}pp`);
          return {
            label: item.label,
            value: parts.length > 0 ? parts.join(" | ") : "n/a",
            delta: typeof d24 === "number" ? d24 * 100 : undefined,
            deltaFormat: "abs" as const,
            series,
          };
        }),
      },
    ];

    return [
      ...widgetsFromGlobalContext,
      topSignalsWidget,
      logisticsFeedWidget,
      marketsFeedWidget,
      policyFeedWidget,
      weatherFeedWidget,
      ...widgetsFromExpansion,
      ...widgetsFromMarkets,
      ...widgetsFromLogistics,
      ...widgetsFromIndices,
    ];
  }, [grainWidgetsQuery.data, grainMarketsQuery.data, logisticsQuery.data, indicesQuery.data, fxQuery.data, newsQuery.data, clockZones, fxPairs, providerById, predictionMarketsQuery.data, predictionTrendsQuery.data, agroExpectationsQuery.data, agroCompositeTrendsQuery.data, cgoWeightsQuery.data, binanceSnapshotQuery.data, binanceRiskTrendsQuery.data, globalIndicesQuery.data, globalIndicesTrendsQuery.data, country, directPredictionSort, directPredictionRegion]);

  const allWidgets = useMemo(() => [...coreWidgets, ...customWidgets], [coreWidgets, customWidgets]);
  const widgetMap = useMemo(() => Object.fromEntries(allWidgets.map((w) => [w.id, w])), [allWidgets]);
  const providerDebugByWidgetId = useMemo(() => {
    const pairs: Array<[string, ProviderDebug]> = [];
    allWidgets.forEach((widget) => {
      if (!widget.id.startsWith("GW_")) return;
      const kind = widget.id.replace(/^GW_/, "");
      const providerId = WIDGET_KIND_TO_PROVIDER[kind];
      if (!providerId) return;
      const provider = providerById[providerId];
      if (provider) pairs.push([widget.id, provider]);
    });
    return Object.fromEntries(pairs);
  }, [allWidgets, providerById]);
  const widgetIdByProviderId = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    Object.entries(providerDebugByWidgetId).forEach(([widgetId, provider]) => {
      if (!pairs.some(([providerId]) => providerId === provider.providerId)) {
        pairs.push([provider.providerId, widgetId]);
      }
    });
    return Object.fromEntries(pairs) as Record<string, string>;
  }, [providerDebugByWidgetId]);

  const groupedOrder = useMemo(() => {
    const allIds = allWidgets.map((w) => w.id);
    if (grouping === "manual") {
      const known = order.filter((id) => allIds.includes(id));
      const appended = allIds.filter((id) => !known.includes(id));
      return [...known, ...appended];
    }
    if (grouping === "topic") {
      const byTopic = [...allWidgets].sort((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
      return byTopic.map((w) => w.id);
    }
    const bySource = [...allWidgets].sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
    return bySource.map((w) => w.id);
  }, [allWidgets, order, grouping]);

  const visibleWidgets = useMemo(() => {
    const filtered = groupedOrder
      .map((id) => widgetMap[id])
      .filter((widget): widget is GridWidget => Boolean(widget))
      .filter((widget) => {
        if (hiddenIds.includes(widget.id) && !showHidden) return false;
        if (heroPins.includes(widget.id)) return false;
        if (showOnlyLive && widgetDataState(widget) !== "live") return false;
        if (healthFilter !== "all" && widgetDataState(widget) !== healthFilter) return false;
        if (role !== "all" && !widget.roles.includes(role)) return false;
        if (topic !== "all" && widget.topic !== topic) return false;
        if (widget.territory !== "GLOBAL" && widget.territory !== country) return false;
        return true;
      });

    if (sortMode === "default") {
      if (!pinDenseTop) return filtered;
      return [...filtered].sort((a, b) => {
        const topicRank = topicPlacementPriority(b.topic) - topicPlacementPriority(a.topic);
        if (topicRank !== 0) return topicRank;
        const scoreRank = widgetAutoPackScore(b) - widgetAutoPackScore(a);
        if (scoreRank !== 0) return scoreRank;
        const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.title.localeCompare(b.title);
      });
    }
    if (sortMode === "source") {
      return [...filtered].sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
    }
    if (sortMode === "freshness") {
      return [...filtered].sort((a, b) => {
        const aRank = getStatusRank(a.status);
        const bRank = getStatusRank(b.status);
        if (aRank !== bRank) return bRank - aRank;
        const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return bTime - aTime;
      });
    }
    return [...filtered].sort((a, b) => {
      const aDelta = Math.max(...a.metrics.map((m) => Math.abs(m.delta || 0)), 0);
      const bDelta = Math.max(...b.metrics.map((m) => Math.abs(m.delta || 0)), 0);
      if (aDelta !== bDelta) return bDelta - aDelta;
      return getStatusRank(b.status) - getStatusRank(a.status);
    });
  }, [groupedOrder, widgetMap, hiddenIds, showHidden, role, topic, country, sortMode, heroPins, showOnlyLive, healthFilter, pinDenseTop]);

  const heroCandidateWidgets = useMemo(() => {
    return groupedOrder
      .map((id) => widgetMap[id])
      .filter((widget): widget is GridWidget => Boolean(widget))
      .filter((widget) => {
        if (hiddenIds.includes(widget.id) && !showHidden) return false;
        if (role !== "all" && !widget.roles.includes(role)) return false;
        if (topic !== "all" && widget.topic !== topic) return false;
        if (widget.territory !== "GLOBAL" && widget.territory !== country) return false;
        if (showOnlyLive && widgetDataState(widget) !== "live") return false;
        if (healthFilter !== "all" && widgetDataState(widget) !== healthFilter) return false;
        return true;
      });
  }, [groupedOrder, widgetMap, hiddenIds, showHidden, role, topic, country, showOnlyLive, healthFilter]);

  const heroPinnedWidgets = useMemo(() => {
    const uniqueIds = Array.from(new Set(heroPins));
    const pinned = uniqueIds.map((id) => widgetMap[id]).filter((widget): widget is GridWidget => Boolean(widget));
    const byId = new Set<string>();
    const livePool = heroCandidateWidgets
      .filter((widget) => widgetDataState(widget) === "live")
      .sort((a, b) => widgetHeroPriorityScore(b) - widgetHeroPriorityScore(a));
    const usedPool = new Set<string>();
    const resolved: GridWidget[] = [];

    const takeBestByTopic = (targetTopic: MonitorTopic): GridWidget | null => {
      for (const candidate of livePool) {
        if (usedPool.has(candidate.id)) continue;
        if (byId.has(candidate.id)) continue;
        if (candidate.topic !== targetTopic) continue;
        usedPool.add(candidate.id);
        return candidate;
      }
      return null;
    };
    const takeBestAny = (): GridWidget | null => {
      for (const candidate of livePool) {
        if (usedPool.has(candidate.id)) continue;
        if (byId.has(candidate.id)) continue;
        usedPool.add(candidate.id);
        return candidate;
      }
      return null;
    };

    for (const pinnedWidget of pinned) {
      if (resolved.length >= 4) break;
      const state = widgetDataState(pinnedWidget);
      const needsReplacement = state !== "live" || isIndexCardStale(pinnedWidget);
      const chosen = needsReplacement ? takeBestByTopic(pinnedWidget.topic) || takeBestAny() || pinnedWidget : pinnedWidget;
      if (byId.has(chosen.id)) continue;
      byId.add(chosen.id);
      resolved.push(chosen);
    }

    while (resolved.length < 4) {
      const fallback = takeBestAny();
      if (!fallback) break;
      if (byId.has(fallback.id)) continue;
      byId.add(fallback.id);
      resolved.push(fallback);
    }

    return resolved.sort((a, b) => widgetHeroPriorityScore(b) - widgetHeroPriorityScore(a)).slice(0, 4);
  }, [heroPins, widgetMap, heroCandidateWidgets]);

  const healthCounts = useMemo(() => {
    return visibleWidgets.reduce(
      (acc, widget) => {
        const state = widgetDataState(widget);
        acc[state] += 1;
        return acc;
      },
      { live: 0, degraded: 0, empty: 0 },
    );
  }, [visibleWidgets]);
  const topicHealthRows = useMemo<TopicHealthRow[]>(() => {
    const topics: Array<Exclude<MonitorTopic, "all">> = ["markets", "logistics", "policy", "weather"];
    const inScope = groupedOrder
      .map((id) => widgetMap[id])
      .filter((widget): widget is GridWidget => Boolean(widget))
      .filter((widget) => {
        if (hiddenIds.includes(widget.id) && !showHidden) return false;
        if (heroPins.includes(widget.id)) return false;
        if (role !== "all" && !widget.roles.includes(role)) return false;
        if (widget.territory !== "GLOBAL" && widget.territory !== country) return false;
        return true;
      });
    return topics.map((topicKey) => {
      const scoped = inScope.filter((widget) => widget.topic === topicKey);
      const live = scoped.filter((widget) => widgetDataState(widget) === "live").length;
      const total = scoped.length;
      return {
        topic: topicKey,
        live,
        total,
        livePercent: total > 0 ? Math.round((live / total) * 100) : 0,
      };
    });
  }, [groupedOrder, widgetMap, hiddenIds, showHidden, heroPins, role, country]);
  const providerHealthRows = useMemo<ProviderHealthRow[]>(() => {
    return (activationQuery.data?.providers || [])
      .map((provider) => {
        const mapped = typeof provider.mappedCount === "number" ? provider.mappedCount : 0;
        return {
          providerId: provider.providerId,
          state: providerHealthState(provider),
          status: provider.status || "OFFLINE",
          mapped,
          errorKind: provider.lastError?.errorKind || "none",
          httpStatus: provider.httpStatus ?? provider.lastError?.httpStatus,
          lastFetchAt: provider.lastFetchAt,
          rationale: providerRationale(provider),
        } as ProviderHealthRow;
      })
      .sort((a, b) => {
        const rank = { live: 3, degraded: 2, empty: 1 } as const;
        if (rank[a.state] !== rank[b.state]) return rank[b.state] - rank[a.state];
        if (a.mapped !== b.mapped) return b.mapped - a.mapped;
        return a.providerId.localeCompare(b.providerId);
      });
  }, [activationQuery.data]);
  const openProviderDebug = (providerId: string) => {
    setDebugProviderId(providerId);
    setDebugWidgetId(widgetIdByProviderId[providerId] || null);
  };
  const liveTotalCount = healthCounts.live + healthCounts.degraded + healthCounts.empty;
  const livePercent = liveTotalCount > 0 ? Math.round((healthCounts.live / liveTotalCount) * 100) : 0;
  const predictionHealth = useMemo(() => {
    const hasIndices = (predictionMarketsQuery.data?.indices || []).some((row) => row.value != null);
    const hasTrends = Object.values(predictionTrendsQuery.data?.byIndex || {}).some((row) => (row?.points || []).length > 0);
    const marketCount = predictionMarketsQuery.data?.marketCount || 0;
    if (hasIndices && hasTrends) return "live" as const;
    if (marketCount > 0 || hasIndices || hasTrends) return "degraded" as const;
    return "empty" as const;
  }, [predictionMarketsQuery.data, predictionTrendsQuery.data]);
  const refreshToken = [
    newsQuery.dataUpdatedAt,
    grainWidgetsQuery.dataUpdatedAt,
    grainMarketsQuery.dataUpdatedAt,
    logisticsQuery.dataUpdatedAt,
    indicesQuery.dataUpdatedAt,
    fxQuery.dataUpdatedAt,
    predictionMarketsQuery.dataUpdatedAt,
    activationQuery.dataUpdatedAt,
    predictionTrendsQuery.dataUpdatedAt,
    agroExpectationsQuery.dataUpdatedAt,
    agroCompositeTrendsQuery.dataUpdatedAt,
    cgoWeightsQuery.dataUpdatedAt,
    binanceSnapshotQuery.dataUpdatedAt,
    binanceRiskTrendsQuery.dataUpdatedAt,
  ].join(":");
  const lastHealthRef = useRef<{ token: string; live: number; total: number } | null>(null);
  const [healthTrend, setHealthTrend] = useState<{ liveDelta: number; livePctDelta: number } | null>(null);
  useEffect(() => {
    const current = { token: refreshToken, live: healthCounts.live, total: liveTotalCount };
    const prev = lastHealthRef.current;
    if (!prev || prev.token === current.token) return;
    const prevPct = prev.total > 0 ? (prev.live / prev.total) * 100 : 0;
    const currentPct = current.total > 0 ? (current.live / current.total) * 100 : 0;
    setHealthTrend({
      liveDelta: current.live - prev.live,
      livePctDelta: Math.round((currentPct - prevPct) * 10) / 10,
    });
  }, [refreshToken, healthCounts.live, liveTotalCount]);
  useEffect(() => {
    lastHealthRef.current = { token: refreshToken, live: healthCounts.live, total: liveTotalCount };
  }, [refreshToken, healthCounts.live, liveTotalCount]);

  const topSignals = newsQuery.data?.topSignals || [];
  const feed = newsQuery.data?.feed || [];
  const gridColumnCount = getGridColumnCount(viewportWidth);

  const filteredSignals = useMemo(() => {
    const roleTopic = topSignals.filter((item) => {
      if (!newsMatchesRole(item, role)) return false;
      if (!newsMatchesTopic(item, topic)) return false;
      return true;
    });
    return applyCountryFallbackFilter(roleTopic, country);
  }, [topSignals, topic, role, country]);

  const filteredFeed = useMemo(() => {
    const roleTopic = feed.filter((item) => {
      if (!newsMatchesRole(item, role)) return false;
      if (!newsMatchesTopic(item, topic)) return false;
      return true;
    });
    return applyCountryFallbackFilter(roleTopic, country);
  }, [feed, topic, role, country]);
  const customHlsSources = useMemo<VideoSource[]>(() => {
    const urls = [
      import.meta.env.VITE_MONITOR_HLS_1 as string | undefined,
      import.meta.env.VITE_MONITOR_HLS_2 as string | undefined,
      import.meta.env.VITE_MONITOR_HLS_3 as string | undefined,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return urls.map((url, idx) => ({
      id: `custom-hls-${idx + 1}`,
      name: `Custom HLS ${idx + 1}`,
      category: "custom",
      status: "LIVE_STREAM",
      mode: "video",
      url,
      note: "RTSP->HLS live stream",
    }));
  }, []);
  const videoSources = useMemo<VideoSource[]>(() => [...STATIC_VIDEO_SOURCES, ...customHlsSources], [customHlsSources]);
  const liveVideoSources = useMemo(
    () => videoSources.filter((source) => (source.status === "LIVE_EMBED" || source.status === "LIVE_STREAM") && Boolean(source.url)),
    [videoSources],
  );
  const videoSourcesByTopic = useMemo(
    () =>
      liveVideoSources.filter((source) => {
        if (videoTopic === "all") return true;
        return inferVideoTopic(source) === videoTopic;
      }),
    [liveVideoSources, videoTopic],
  );
  useEffect(() => {
    if (videoChannel === "all") return;
    if (!videoSourcesByTopic.some((source) => source.id === videoChannel)) {
      setVideoChannel("all");
    }
  }, [videoChannel, videoSourcesByTopic]);
  const selectedVideoChannel = useMemo(
    () => videoSourcesByTopic.find((source) => source.id === videoChannel) || null,
    [videoChannel, videoSourcesByTopic],
  );
  const prioritizedVideoSources = useMemo(() => {
    if (!selectedVideoChannel) return videoSourcesByTopic;
    return [selectedVideoChannel, ...videoSourcesByTopic.filter((source) => source.id !== selectedVideoChannel.id)];
  }, [selectedVideoChannel, videoSourcesByTopic]);
  const videoRailSlots = useMemo(() => prioritizedVideoSources.slice(0, 6), [prioritizedVideoSources]);
  const mapVideoSource = useMemo(
    () => (mapVideoSourceId ? liveVideoSources.find((source) => source.id === mapVideoSourceId) || null : null),
    [liveVideoSources, mapVideoSourceId],
  );
  const pendingVideoSources = useMemo(
    () => videoSources.filter((source) => source.status === "CONSTRAINED" || source.status === "CONTRACT_REQUIRED"),
    [videoSources],
  );

  const geoPoints = useMemo<GeoPoint[]>(() => {
    const points: GeoPoint[] = [];
    const bucket: Record<Country, { logistics: number; weather: number; policy: number }> = {
      US: { logistics: 0, weather: 0, policy: 0 },
      UA: { logistics: 0, weather: 0, policy: 0 },
      BR: { logistics: 0, weather: 0, policy: 0 },
      AR: { logistics: 0, weather: 0, policy: 0 },
      FR: { logistics: 0, weather: 0, policy: 0 },
      DE: { logistics: 0, weather: 0, policy: 0 },
      RO: { logistics: 0, weather: 0, policy: 0 },
    };
    const sourceNews = [...filteredFeed, ...filteredSignals].slice(0, 60);
    sourceNews.forEach((item) => {
      const matchCountry = inferNewsCountry(item) || country;
      const tags = (item.topic_tags || []).map((tag) => String(tag).toLowerCase());
      const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
      const isLogistics = tags.includes("logistics") || text.includes("shipping") || text.includes("port");
      const isWeather = tags.includes("weather") || text.includes("weather") || text.includes("drought") || text.includes("rain");
      const isPolicy = tags.includes("policy") || text.includes("tariff") || text.includes("sanction");
      if (isLogistics) bucket[matchCountry].logistics += 1;
      if (isWeather) bucket[matchCountry].weather += 1;
      if (isPolicy) bucket[matchCountry].policy += 1;
    });

    (Object.keys(COUNTRY_GEO_ANCHORS) as Country[]).forEach((countryCode) => {
      const anchor = COUNTRY_GEO_ANCHORS[countryCode];
      const regionCount = bucket[countryCode].logistics;
      if (regionCount > 0) {
        points.push({
          id: `logistics-${countryCode}`,
          layer: "logistics",
          country: countryCode,
          x: anchor.x,
          y: anchor.y,
          intensity: clamp(regionCount / 8, 0.15, 1),
          label: `${anchor.label} logistics`,
          value: `${regionCount} mentions`,
        });
      }
      const weatherCount = bucket[countryCode].weather;
      if (weatherCount > 0) {
        points.push({
          id: `weather-${countryCode}`,
          layer: "weather",
          country: countryCode,
          x: anchor.x + 12,
          y: anchor.y - 10,
          intensity: clamp(weatherCount / 6, 0.15, 1),
          label: `${anchor.label} weather`,
          value: `${weatherCount} signals`,
        });
      }
    });

    const marketRows = globalIndicesQuery.data?.rows || [];
    const regionToCountry: Record<string, Country> = { US: "US", EU: "DE", BR: "BR", AR: "AR", EM: "UA" };
    marketRows.forEach((row) => {
      const target = regionToCountry[row.region] || country;
      const anchor = COUNTRY_GEO_ANCHORS[target];
      if (!anchor) return;
      const absDelta = Math.abs(Number(row.dayChangePct || 0));
      if (!Number.isFinite(absDelta)) return;
      points.push({
        id: `markets-${row.symbol}`,
        layer: "markets",
        country: target,
        x: anchor.x - 10,
        y: anchor.y + 10,
        intensity: clamp(absDelta / 2.5, 0.1, 1),
        label: `${row.symbol} market`,
        value: `${row.dayChangePct != null ? `${row.dayChangePct >= 0 ? "+" : ""}${row.dayChangePct.toFixed(2)}%` : "n/a"}`,
      });
    });

    const riskIndices = predictionMarketsQuery.data?.indices || [];
    const geoRisk = riskIndices.find((row) => row.key === "geopolitics_risk")?.value;
    const grainRisk = riskIndices.find((row) => row.key === "grain_risk")?.value;
    if (typeof geoRisk === "number") {
      const ua = COUNTRY_GEO_ANCHORS.UA;
      points.push({
        id: "risk-ua",
        layer: "risk",
        country: "UA",
        x: ua.x + 20,
        y: ua.y - 12,
        intensity: clamp(geoRisk, 0.2, 1),
        label: "Geopolitics risk",
        value: `${(geoRisk * 100).toFixed(1)}%`,
      });
    }
    if (typeof grainRisk === "number") {
      const br = COUNTRY_GEO_ANCHORS.BR;
      points.push({
        id: "risk-br",
        layer: "risk",
        country: "BR",
        x: br.x + 26,
        y: br.y + 8,
        intensity: clamp(grainRisk, 0.2, 1),
        label: "Grain prediction risk",
        value: `${(grainRisk * 100).toFixed(1)}%`,
      });
    }

    return points;
  }, [filteredFeed, filteredSignals, country, globalIndicesQuery.data?.rows, predictionMarketsQuery.data?.indices]);

  const activeGeoPoints = useMemo(
    () => geoPoints.filter((point) => geoLayers[point.layer]),
    [geoPoints, geoLayers],
  );

  const yieldFaoRows = yieldFoodSecurityQuery.data?.foodPrices?.faoRows || [];
  const yieldStressRows = yieldFoodSecurityQuery.data?.foodSecurity?.marketRows || [];
  const yieldSectionStatus = (
    yieldFoodSecurityQuery.data?.geoglam?.status ||
    yieldFoodSecurityQuery.data?.foodPrices?.status ||
    yieldFoodSecurityQuery.data?.foodSecurity?.status ||
    "CONSTRAINED"
  ).toUpperCase();

  const applyRenderPreset = (preset: RenderPreset) => {
    setRenderPreset(preset);
    setRenderModeById((current) => {
      const next = { ...current };
      visibleWidgets.forEach((widget) => {
        next[widget.id] = modeForPreset(widget, preset);
      });
      return next;
    });
  };

  const refreshAllData = async () => {
    setIsRefreshingData(true);
    forceRefreshWidgetsRef.current = true;
    try {
      await Promise.all([
        newsQuery.refetch(),
        grainWidgetsQuery.refetch(),
        grainMarketsQuery.refetch(),
        logisticsQuery.refetch(),
        indicesQuery.refetch(),
        fxQuery.refetch(),
        predictionMarketsQuery.refetch(),
        predictionTrendsQuery.refetch(),
        agroExpectationsQuery.refetch(),
        agroCompositeTrendsQuery.refetch(),
        cgoWeightsQuery.refetch(),
        binanceSnapshotQuery.refetch(),
        binanceRiskTrendsQuery.refetch(),
        globalIndicesQuery.refetch(),
        globalIndicesTrendsQuery.refetch(),
        yieldFoodSecurityQuery.refetch(),
      ]);
    } finally {
      setIsRefreshingData(false);
    }
  };

  const resizeWidget = (id: string, axis: "w" | "h", delta: 1 | -1) => {
    setLayoutById((current) => {
      const prev = current[id] || ({ w: 1, h: 1 } as GridLayout);
      if (axis === "w") {
        const nextW = Math.max(1, Math.min(3, prev.w + delta)) as 1 | 2 | 3;
        return { ...current, [id]: { ...prev, w: nextW } };
      }
      const nextH = Math.max(1, Math.min(2, prev.h + delta)) as 1 | 2;
      return { ...current, [id]: { ...prev, h: nextH } };
    });
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  };

  const addCustomWidget = () => {
    if (!draft.title.trim()) return;
    const id = `CUSTOM_${Date.now()}`;
    const widget: GridWidget = {
      id,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || "Custom widget",
      source: draft.source.trim() || "Manual",
      status: "CUSTOM",
      topic: draft.topic,
      roles: ["farmer", "trader", "broker"],
      territory: country,
      updatedAt: new Date().toISOString(),
      metrics: [],
    };
    setCustomWidgets((current) => [...current, widget]);
    setOrder((current) => [...current, id]);
    setDraft({ title: "", subtitle: "", source: "", topic: draft.topic });
    setIsAddWidgetOpen(false);
    setGrouping("manual");
  };

  const hiddenCount = hiddenIds.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="text-base font-semibold tracking-wide">Cropto Monitor</div>
            <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-300">v3 beta</span>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded border border-border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={14} className="inline" /> : <Moon size={14} className="inline" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="rounded border border-border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              title="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 size={14} className="inline" /> : <Maximize2 size={14} className="inline" />}
            </button>
            <button
              onClick={() => setIsAddWidgetOpen(true)}
              className="rounded border border-primary/60 bg-primary/15 px-2 py-1 text-sm text-primary"
            >
              <Plus size={13} className="mr-1 inline" />
              Add widget
            </button>
          </div>
        </div>
      </header>

      <section className="sticky top-[44px] z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Control</div>
          <div className="h-4 w-px bg-border" />

          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setRole(option.id)}
              className={cn(
                "rounded border px-2.5 py-1 text-xs",
                role === option.id ? "border-primary/70 bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}

          <div className="h-4 w-px bg-border" />

          {TOPIC_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setTopic(option.id)}
              className={cn(
                "rounded border px-2 py-1 text-[11px] uppercase tracking-[0.12em]",
                topic === option.id ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300" : "border-border text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}

          <div className="h-4 w-px bg-border" />

          <select
            value={country}
            onChange={(event) => setCountry(event.target.value as Country)}
            className="rounded border border-border bg-card px-2 py-1 text-xs"
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={grouping}
            onChange={(event) => setGrouping(event.target.value as GridGrouping)}
            className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
          >
            <option value="manual">Manual</option>
            <option value="topic">Topic</option>
            <option value="source">Source</option>
          </select>

          <select
            value={directPredictionRegion}
            onChange={(event) => setDirectPredictionRegion(event.target.value as DirectPredictionRegion)}
            className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
            title="Direct grain prediction region filter"
          >
            <option value="ALL">Pred region: all</option>
            <option value="GLOBAL">Pred region: global</option>
            {COUNTRY_OPTIONS.map((option) => (
              <option key={`pred-region-${option.id}`} value={option.id}>
                Pred region: {option.id}
              </option>
            ))}
          </select>

          <select
            value={directPredictionSort}
            onChange={(event) => setDirectPredictionSort(event.target.value as DirectPredictionSort)}
            className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
            title="Direct grain prediction sort"
          >
            <option value="liquidity">Pred sort: liquidity</option>
            <option value="volume">Pred sort: volume</option>
            <option value="quality">Pred sort: quality</option>
          </select>

          <button
            onClick={() => setShowHidden((current) => !current)}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              showHidden ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-border text-muted-foreground",
            )}
          >
            Hidden {hiddenCount}
          </button>
          <button
            onClick={() => setShowOnlyLive((current) => !current)}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              showOnlyLive ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-border text-muted-foreground",
            )}
          >
            Live only {showOnlyLive ? "on" : "off"}
          </button>
          <button
            onClick={refreshAllData}
            disabled={isRefreshingData}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              isRefreshingData
                ? "cursor-not-allowed border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {isRefreshingData ? "Refreshing..." : "Refresh data"}
          </button>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-3 py-3">
        <section className="rounded border border-border bg-card px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.12em]">
            <span className="text-muted-foreground">Provider health</span>
            <button
              onClick={() => setHealthFilter("all")}
              className={cn(
                "rounded border px-1.5 py-0.5",
                healthFilter === "all" ? "border-primary/70 bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
            >
              all {liveTotalCount}
            </button>
            <button
              onClick={() => setHealthFilter("live")}
              className={cn(
                "rounded border px-1.5 py-0.5",
                healthFilter === "live" ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-emerald-500/40 text-emerald-300/80",
              )}
            >
              live {healthCounts.live}
            </button>
            <button
              onClick={() => setHealthFilter("degraded")}
              className={cn(
                "rounded border px-1.5 py-0.5",
                healthFilter === "degraded" ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-amber-500/40 text-amber-300/80",
              )}
            >
              degraded {healthCounts.degraded}
            </button>
            <button
              onClick={() => setHealthFilter("empty")}
              className={cn(
                "rounded border px-1.5 py-0.5",
                healthFilter === "empty" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-red-500/40 text-red-300/80",
              )}
            >
              empty {healthCounts.empty}
            </button>
            <span className="ml-auto rounded border border-cyan-500/60 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">
              live {livePercent}%
            </span>
            {topicHealthRows.map((row) => (
              <span key={`topic-live-${row.topic}`} className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                {row.topic} {row.livePercent}% ({row.live}/{row.total})
              </span>
            ))}
            <span className={cn("rounded border px-1.5 py-0.5", (healthTrend?.liveDelta || 0) >= 0 ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-red-500/60 bg-red-500/10 text-red-300")}>
              Δ {healthTrend ? `${healthTrend.liveDelta >= 0 ? "+" : ""}${healthTrend.liveDelta} (${healthTrend.livePctDelta >= 0 ? "+" : ""}${healthTrend.livePctDelta}%)` : "n/a"}
            </span>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 uppercase tracking-[0.1em]",
                predictionHealth === "live"
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                  : predictionHealth === "degraded"
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                    : "border-red-500/60 bg-red-500/10 text-red-300",
              )}
            >
              prediction {predictionHealth}
            </span>
            <button
              onClick={() => setShowHealthDetails((current) => !current)}
              className={cn(
                "rounded border px-1.5 py-0.5",
                showHealthDetails ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300" : "border-border text-muted-foreground",
              )}
            >
              details {showHealthDetails ? "on" : "off"}
            </button>
            <button
              onClick={() => setShowHealthPanel(true)}
              className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            >
              panel
            </button>
          </div>
          {showHealthDetails ? (
            <div className="mt-1.5 monitor-widget-scroll max-h-44 overflow-y-auto rounded border border-border bg-muted/10 p-1.5">
              <div className="mb-1 grid grid-cols-[minmax(0,1.3fr)_auto_auto_auto_auto_minmax(0,1.8fr)] gap-2 px-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                <span>provider</span>
                <span>state</span>
                <span>mapped</span>
                <span>error</span>
                <span>fresh</span>
                <span>rationale</span>
              </div>
              <div className="space-y-1">
                {(healthFilter === "all"
                  ? providerHealthRows
                  : providerHealthRows.filter((row) => row.state === healthFilter)
                ).map((row) => (
                  <button
                    key={`provider-health-${row.providerId}`}
                    onClick={() => openProviderDebug(row.providerId)}
                    className="grid w-full grid-cols-[minmax(0,1.3fr)_auto_auto_auto_auto_minmax(0,1.8fr)] items-center gap-2 rounded border border-border px-1.5 py-1 text-left text-[10px] hover:border-cyan-500/60 hover:bg-cyan-500/5"
                  >
                    <span className="truncate font-medium">{row.providerId}</span>
                    <span
                      className={cn(
                        "rounded border px-1 py-0 uppercase tracking-[0.1em]",
                        row.state === "live"
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                          : row.state === "degraded"
                            ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                            : "border-red-500/60 bg-red-500/10 text-red-300",
                      )}
                    >
                      {row.state}
                    </span>
                    <span>{row.mapped}</span>
                    <span className="truncate">{row.errorKind}{row.httpStatus ? `:${row.httpStatus}` : ""}</span>
                    <span>{formatAgeShort(row.lastFetchAt)}</span>
                    <span className="truncate text-muted-foreground">{row.rationale}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid items-stretch gap-2 xl:grid-cols-[2fr_1.15fr_0.85fr]">
          <div className="rounded border border-border bg-card p-2">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>Global Situation</span>
              <div className="flex items-center gap-1">
                {(Object.keys(GEO_LAYER_META) as GeoLayerId[]).map((layerId) => (
                  <button
                    key={`geo-layer-${layerId}`}
                    onClick={() => setGeoLayers((current) => ({ ...current, [layerId]: !current[layerId] }))}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px]",
                      geoLayers[layerId]
                        ? "border-primary/70 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {GEO_LAYER_META[layerId].label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setGeoZoom(1);
                    setGeoPan({ x: 0, y: 0 });
                  }}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  reset
                </button>
                {mapVideoSource ? (
                  <button
                    onClick={() => setMapVideoSourceId(null)}
                    className="rounded border border-cyan-500/60 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300"
                  >
                    video on map
                  </button>
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                "relative h-[392px] overflow-hidden rounded border border-border bg-[#06090f]",
                mapVideoSource ? "cursor-default" : geoDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onWheel={(event) => {
                if (mapVideoSource) return;
                event.preventDefault();
                const delta = event.deltaY < 0 ? 0.1 : -0.1;
                setGeoZoom((current) => clamp(Number((current + delta).toFixed(2)), 0.8, 2.4));
              }}
              onMouseDown={(event) => {
                if (mapVideoSource) return;
                setGeoDragging(true);
                geoDragStartRef.current = { x: event.clientX, y: event.clientY, panX: geoPan.x, panY: geoPan.y };
              }}
              onMouseMove={(event) => {
                if (mapVideoSource) return;
                const start = geoDragStartRef.current;
                if (!geoDragging || !start) return;
                const dx = event.clientX - start.x;
                const dy = event.clientY - start.y;
                setGeoPan({
                  x: clamp(start.panX + dx, -220, 220),
                  y: clamp(start.panY + dy, -140, 140),
                });
              }}
              onMouseUp={() => {
                setGeoDragging(false);
                geoDragStartRef.current = null;
              }}
              onMouseLeave={() => {
                setGeoDragging(false);
                geoDragStartRef.current = null;
                setGeoHoverPointId(null);
              }}
            >
              {mapVideoSource ? (
                <div className="relative h-full w-full bg-black">
                  {mapVideoSource.mode === "iframe" && mapVideoSource.url ? (
                    <iframe
                      src={mapVideoSource.url}
                      title={mapVideoSource.name}
                      loading="lazy"
                      allow="autoplay; fullscreen; picture-in-picture"
                      className="h-full w-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : mapVideoSource.mode === "video" && mapVideoSource.url ? (
                    <video
                      className="h-full w-full object-cover"
                      controls
                      autoPlay
                      muted
                      playsInline
                      preload="metadata"
                      src={mapVideoSource.url}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Stream unavailable for map preview.</div>
                  )}
                  <div className="absolute right-2 top-2 flex gap-1">
                    {mapVideoSource.url ? (
                      <a
                        href={mapVideoSource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-border bg-black/55 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Open source
                      </a>
                    ) : null}
                    <button
                      onClick={() => setMapVideoSourceId(null)}
                      className="rounded border border-border bg-black/55 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Back to map
                    </button>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 border-t border-border bg-black/65 px-2 py-1 text-xs text-zinc-200">
                    {mapVideoSource.name}
                  </div>
                </div>
              ) : (
                <>
                  <svg viewBox="0 0 1000 460" className="h-full w-full select-none">
                    <defs>
                      <radialGradient id="oceanGlow" cx="50%" cy="45%">
                        <stop offset="0%" stopColor="#0f172a" />
                        <stop offset="100%" stopColor="#020617" />
                      </radialGradient>
                      <filter id="mapBlur">
                        <feGaussianBlur stdDeviation="0.5" />
                      </filter>
                    </defs>
                    <rect x="0" y="0" width="1000" height="460" fill="url(#oceanGlow)" />
                    <g transform={`translate(${geoPan.x} ${geoPan.y}) scale(${geoZoom}) translate(${(1 - geoZoom) * 500} ${(1 - geoZoom) * 230})`}>
                      <image
                        href="/maps/monitor-map.png"
                        x="0"
                        y="0"
                        width="1000"
                        height="460"
                        preserveAspectRatio="xMidYMid slice"
                        opacity="0.95"
                      />
                      <rect x="0" y="0" width="1000" height="460" fill="#020617" opacity="0.22" />
                      <g stroke="#0b1220" strokeWidth="1" opacity="0.55">
                        {Array.from({ length: 9 }).map((_, idx) => (
                          <line key={`lat-${idx}`} x1="0" y1={idx * 58} x2="1000" y2={idx * 58} />
                        ))}
                        {Array.from({ length: 11 }).map((_, idx) => (
                          <line key={`lon-${idx}`} x1={idx * 100} y1="0" x2={idx * 100} y2="460" />
                        ))}
                      </g>
                      {activeGeoPoints.map((point) => {
                        const meta = GEO_LAYER_META[point.layer];
                        const isHover = geoHoverPointId === point.id;
                        const radius = 4 + point.intensity * 14;
                        return (
                          <g
                            key={point.id}
                            onMouseEnter={() => setGeoHoverPointId(point.id)}
                            onMouseLeave={() => setGeoHoverPointId(null)}
                          >
                            <circle cx={point.x} cy={point.y} r={radius + (isHover ? 4 : 0)} fill={meta.stroke} opacity={0.15 + point.intensity * 0.28} />
                            <circle cx={point.x} cy={point.y} r={2.6 + point.intensity * 3.2} fill={meta.stroke} filter="url(#mapBlur)" />
                            {isHover ? (
                              <>
                                <rect x={point.x + 10} y={point.y - 30} rx="4" ry="4" width="150" height="30" fill="#020617" stroke={meta.stroke} />
                                <text x={point.x + 16} y={point.y - 18} fill="#e2e8f0" fontSize="10">{point.label}</text>
                                <text x={point.x + 16} y={point.y - 8} fill={meta.stroke} fontSize="10">{point.value}</text>
                              </>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="rounded border border-border bg-black/35 px-1.5 py-0.5">
                      zoom {geoZoom.toFixed(1)}x
                    </span>
                    <span className="rounded border border-border bg-black/35 px-1.5 py-0.5">
                      points {activeGeoPoints.length}
                    </span>
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1">
                    <button
                      onClick={() => setGeoZoom((current) => clamp(Number((current - 0.1).toFixed(2)), 0.8, 2.4))}
                      className="rounded border border-border bg-black/35 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      -
                    </button>
                    <button
                      onClick={() => setGeoZoom((current) => clamp(Number((current + 0.1).toFixed(2)), 0.8, 2.4))}
                      className="rounded border border-border bg-black/35 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      +
                    </button>
                  </div>
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    {(Object.keys(GEO_LAYER_META) as GeoLayerId[]).map((layerId) => (
                      <span
                        key={`geo-legend-${layerId}`}
                        className={cn(
                          "rounded border border-border bg-black/35 px-1.5 py-0.5 text-[10px]",
                          GEO_LAYER_META[layerId].tone,
                        )}
                      >
                        {GEO_LAYER_META[layerId].label}
                      </span>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border bg-black/45 px-2 py-1 text-[10px] text-muted-foreground">
                    Internal geo layers engine: canvas/svg foundation active. GEOGLAM remains paused in hero until fresher layer sources are connected.
                  </div>
                </>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {mapVideoSource
                ? "Video preview is opened in map zone. Use Back to map to return."
                : "Drag to pan, mouse wheel to zoom. Layer points are synthesized from live feed, prediction risk, and market deltas."}
            </div>
          </div>
          <div className="rounded border border-border bg-card p-2">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>Video Rail</span>
              <span>{videoRailSlots.length}/6 live</span>
            </div>
            <div className="mb-1 flex gap-1">
              <select
                value={videoTopic}
                onChange={(event) => setVideoTopic(event.target.value as VideoTopic)}
                className="min-w-0 flex-1 rounded border border-border bg-card px-1.5 py-1 text-[11px] uppercase tracking-[0.12em]"
              >
                {VIDEO_TOPIC_OPTIONS.map((option) => (
                  <option key={`video-topic-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={videoChannel}
                onChange={(event) => setVideoChannel(event.target.value)}
                className="min-w-0 flex-[1.4] rounded border border-border bg-card px-1.5 py-1 text-[11px]"
              >
                <option value="all">All channels</option>
                {videoSourcesByTopic.map((source) => (
                  <option key={`video-channel-${source.id}`} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="monitor-widget-scroll max-h-[392px] overflow-y-auto pr-0.5">
              <div className="grid grid-cols-1 gap-1.5 2xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, idx) => {
                const source = videoRailSlots[idx];
                if (!source) {
                  return (
                    <div key={`video-slot-empty-${idx}`} className="h-[120px] rounded border border-dashed border-border bg-muted/20 p-1 text-[10px] text-muted-foreground">
                      Live slot {idx + 1}
                    </div>
                  );
                }
                if (source.mode === "iframe" && source.url) {
                  return (
                    <div
                      key={source.id}
                      onClick={() => setMapVideoSourceId(source.id)}
                      className="relative h-[120px] cursor-pointer overflow-hidden rounded border border-border bg-black/30 text-left"
                    >
                      <iframe
                        src={source.url}
                        title={source.name}
                        loading="lazy"
                        allow="autoplay; fullscreen; picture-in-picture"
                        className="h-full w-full"
                        referrerPolicy="no-referrer"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-[10px] text-zinc-200">
                        {source.name}
                      </div>
                    </div>
                  );
                }
                if (source.mode === "video" && source.url) {
                  return (
                    <div
                      key={source.id}
                      onClick={() => setMapVideoSourceId(source.id)}
                      className="relative h-[120px] cursor-pointer overflow-hidden rounded border border-border bg-black/30 text-left"
                    >
                      <video
                        className="h-full w-full object-cover"
                        autoPlay
                        muted
                        playsInline
                        preload="metadata"
                        src={source.url}
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-[10px] text-zinc-200">
                        {source.name}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={source.id}
                    onClick={() => setMapVideoSourceId(source.id)}
                    className="relative h-[120px] cursor-pointer rounded border border-dashed border-border bg-muted/20 p-1 text-left text-[10px] text-muted-foreground"
                  >
                    <div className="line-clamp-2">{source.name}</div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground/80">{source.note || "Preview available in map zone"}</div>
                    <div className="absolute inset-x-1 bottom-1 text-[9px] uppercase tracking-[0.1em] text-cyan-300/90">tap to open</div>
                  </div>
                );
              })}
              </div>
            <div className="mt-1.5 rounded border border-border bg-muted/10 px-1.5 py-1">
              <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Pending sources</div>
              <div className="space-y-1">
                {pendingVideoSources.map((source) => (
                  <div key={`pending-video-${source.id}`} className="flex items-center gap-1 text-[10px]">
                    <span
                      className={cn(
                        "rounded border px-1 py-0 uppercase tracking-[0.1em]",
                        source.status === "CONTRACT_REQUIRED"
                          ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                          : "border-amber-500/60 bg-amber-500/10 text-amber-300",
                      )}
                    >
                      {source.status === "CONTRACT_REQUIRED" ? "locked" : "constrained"}
                    </span>
                    <span className="truncate text-muted-foreground">{source.name}</span>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto rounded border border-border px-1 py-0 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        open
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
          <div className="rounded border border-border bg-card p-2">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>Live Feed</span>
              <span>RSS + signals</span>
            </div>
            <div className="monitor-widget-scroll max-h-[392px] space-y-1.5 overflow-y-auto pr-0.5">
              {filteredFeed.length === 0 ? (
                <div className="rounded border border-dashed border-border p-1.5 text-xs text-muted-foreground">No live feed items for current filters.</div>
              ) : (
                filteredFeed.slice(0, 14).map((item) => {
                  const card = (
                    <>
                      <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="rounded border border-border px-1 py-0 uppercase tracking-[0.08em]">rss</span>
                        <span className="truncate">{item.source_name}</span>
                        <span className="ml-auto">{formatAgeShort(item.published_at)}</span>
                      </div>
                    </>
                  );
                  if (item.url) {
                    return (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded border border-border p-1.5 hover:border-cyan-500/60 hover:bg-cyan-500/5"
                      >
                        {card}
                      </a>
                    );
                  }
                  return (
                    <div key={item.id} className="rounded border border-border p-1.5">
                      {card}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-3">
          {filteredSignals.slice(0, 3).map((item, idx) => (
            <article key={item.id} className="rounded border border-border bg-card p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span>Priority #{idx + 1}</span>
                <span>{item.source_name}</span>
              </div>
              <h3 className="line-clamp-2 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary || "Signal summary unavailable."}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => {
            const widget = heroPinnedWidgets[idx];
            if (!widget) {
              return (
                <article key={`hero-slot-${idx}`} className="rounded border border-dashed border-border bg-card p-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Hero Slot {idx + 1}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Pin a grid widget here.</div>
                </article>
              );
            }
            const autoFilled = !heroPins.includes(widget.id);
            return (
              <article key={widget.id} className="rounded border border-border bg-card p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{widget.title}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {widget.source}
                      {autoFilled ? " • auto" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setHeroPins((current) => current.filter((id) => id !== widget.id))}
                    className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                  >
                    to grid
                  </button>
                </div>
                <div className="monitor-widget-scroll max-h-[120px] space-y-1 overflow-y-auto pr-1">
                  {widget.metrics.slice(0, 4).map((metric) => (
                    <div key={`${widget.id}-${metric.label}`} className="rounded border border-border bg-muted/10 px-1.5 py-1">
                      <div className="truncate text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{metric.label}</div>
                      <div className="line-clamp-2 text-xs">{metric.value}</div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded border border-border bg-card p-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Yield & Food Security</h2>
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]", getStatusTone(yieldSectionStatus))}>
              {yieldSectionStatus}
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {yieldFoodSecurityQuery.data?.geoglam?.note || "public geoglam + fao + wfp/wb blend"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value as Country)}
                className="rounded border border-border bg-card px-2 py-1 text-xs"
                title="Yield/Food country filter"
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={`yield-country-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={yieldCrop}
                onChange={(event) => setYieldCrop(event.target.value as YieldCropFilter)}
                className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
                title="Yield/Food crop filter"
              >
                {YIELD_CROP_OPTIONS.map((option) => (
                  <option key={`yield-crop-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <article className="rounded border border-border bg-muted/10 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span>GEOGLAM Crop Monitor</span>
                <span>{yieldFoodSecurityQuery.data?.geoglam?.selectedCount ?? 0} rows</span>
              </div>
              <div className="monitor-widget-scroll max-h-[180px] space-y-1 overflow-y-auto pr-1">
                <div className="rounded border border-dashed border-border bg-black/20 p-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em]">
                    <span className="text-amber-300">Paused from live map</span>
                    <span className="text-muted-foreground">backfill only</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    GEOGLAM archive rows are kept only as reference metadata. Hero map now stays on internal layers pipeline to avoid stale
                    2024-only visuals.
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                    <div className="rounded border border-border px-1.5 py-1">
                      <span className="text-muted-foreground">Latest update:</span>{" "}
                      <span>{yieldFoodSecurityQuery.data?.geoglam?.latestUpdate ? `${formatAgeShort(yieldFoodSecurityQuery.data.geoglam.latestUpdate)} ago` : "n/a"}</span>
                    </div>
                    <div className="rounded border border-border px-1.5 py-1">
                      <span className="text-muted-foreground">Status rationale:</span>{" "}
                      <span>{yieldFoodSecurityQuery.data?.geoglam?.note || "No GEOGLAM datasets for current filter."}</span>
                    </div>
                  </div>
                  {yieldFoodSecurityQuery.data?.geoglam?.archiveUrl ? (
                    <a
                      href={yieldFoodSecurityQuery.data.geoglam.archiveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                    >
                      Open archive ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="rounded border border-border bg-muted/10 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span>FAO Food Prices</span>
                <span>{yieldFoodSecurityQuery.data?.foodPrices?.source || "FAO FFPI"}</span>
              </div>
              <div className="monitor-widget-scroll max-h-[180px] space-y-1 overflow-y-auto pr-1">
                {yieldFaoRows.length > 0 ? (
                  yieldFaoRows.slice(0, 6).map((row, idx) => (
                    <div key={`yield-fao-${idx}`} className="rounded border border-border px-1.5 py-1">
                      <div className="text-xs font-medium">{row.label}</div>
                      <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{row.value}</span>
                        <span className={cn(typeof row.deltaPct === "number" && row.deltaPct >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {typeof row.deltaPct === "number" ? `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(2)}%` : "n/a"}
                        </span>
                      </div>
                      {Array.isArray(row.series) && row.series.length >= 2 ? (
                        <svg viewBox="0 0 100 100" className="mt-1 h-12 w-full">
                          <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            points={buildMiniSparkPoints(row.series)}
                            className="text-cyan-400"
                          />
                        </svg>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">No FAO rows in current snapshot.</div>
                )}
              </div>
            </article>

            <article className="rounded border border-border bg-muted/10 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span>Food Security Stress</span>
                <span>
                  {typeof yieldFoodSecurityQuery.data?.foodSecurity?.score === "number"
                    ? `${(yieldFoodSecurityQuery.data.foodSecurity.score * 100).toFixed(1)} / 100`
                    : "n/a"}
                </span>
              </div>
              <div className="monitor-widget-scroll max-h-[180px] space-y-1 overflow-y-auto pr-1">
                {yieldStressRows.length > 0 ? (
                  yieldStressRows.slice(0, 8).map((row, idx) => (
                    <div key={`yield-stress-${idx}`} className="rounded border border-border px-1.5 py-1">
                      <div className="line-clamp-1 text-xs font-medium">{row.label}</div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{row.source} • {row.crop}</span>
                        <span>{row.value}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">USD/t norm</span>
                        <span className="font-semibold text-foreground">
                          {(() => {
                            const normalized = normalizeToUsdTon({
                              current: row.current,
                              unit: row.unit,
                              currency: row.currency,
                              valueText: row.value,
                              rates: fxQuery.data?.rates,
                            });
                            return normalized != null ? `${normalized.toFixed(2)} USD/t` : "n/a";
                          })()}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                    {yieldFoodSecurityQuery.data?.foodSecurity?.note || "No WFP/WB rows for current country/crop."}
                  </div>
                )}
              </div>
            </article>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Main Widget Grid</h2>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="rounded border border-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-300">
                  live {healthCounts.live}
                </span>
                <span className="rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-300">
                  degraded {healthCounts.degraded}
                </span>
                <span className="rounded border border-red-500/60 bg-red-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-red-300">
                  empty {healthCounts.empty}
                </span>
              </div>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as GridSort)}
                className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
              >
                <option value="default">Sort: Default</option>
                <option value="impact">Sort: Impact</option>
                <option value="freshness">Sort: Freshness</option>
                <option value="source">Sort: Source</option>
              </select>
              <select
                value={renderPreset}
                onChange={(event) => applyRenderPreset(event.target.value as RenderPreset)}
                className="rounded border border-border bg-card px-2 py-1 text-xs uppercase tracking-[0.12em]"
              >
                <option value="mixed">Render: Mixed</option>
                <option value="data_dense">Render: Data Dense</option>
                <option value="headlines">Render: Headlines</option>
              </select>
              <button
                onClick={() => setPinDenseTop((current) => !current)}
                className={cn(
                  "rounded border px-2 py-1 text-xs",
                  pinDenseTop ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300" : "border-border text-muted-foreground",
                )}
              >
                Pin news/table {pinDenseTop ? "on" : "off"}
              </button>
              <button
                onClick={() => {
                  setOrder([]);
                  setLayoutById({});
                  setHiddenIds([]);
                  setHeroPins([]);
                  setGrouping("manual");
                  setSortMode("default");
                  setHealthFilter("all");
                  setPinDenseTop(true);
                  setDirectPredictionRegion("ALL");
                  setDirectPredictionSort("liquidity");
                  setYieldCrop("ALL");
                  setRenderPreset("mixed");
                  setRenderModeById({});
                }}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset layout
              </button>
              <div className="text-xs text-muted-foreground">{visibleWidgets.length} active widgets</div>
            </div>
          </div>

          <div className="grid auto-rows-[168px] grid-cols-1 grid-flow-row-dense gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleWidgets.map((widget) => {
              const layout = layoutById[widget.id] || ({ w: 1, h: 1 } as GridLayout);
              const dataState = widgetDataState(widget);
              const completenessScore = computeDataCompletenessScore(widget);
              const cardType = inferCardType(widget);
              const providerDebug = providerDebugByWidgetId[widget.id];
              const staleBadge = isIndexCardStale(widget) ? formatStaleAge(widget) : null;
              const spanW = Math.min(layout.w, gridColumnCount);
              const compactCard = layout.h === 1;
              const isDenseCard = cardType === "news" || cardType === "table";
              const headerMaxHeight = compactCard ? (isDenseCard ? 28 : 42) : (isDenseCard ? 48 : 72);
              return (
                <article
                  key={widget.id}
                  draggable={grouping === "manual"}
                  onDragStart={() => setDraggedId(widget.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedId || draggedId === widget.id || grouping !== "manual") return;
                    setOrder((current) => {
                      const base = current.length > 0 ? current : groupedOrder;
                      const next = base.filter((id) => id !== draggedId);
                      const targetIndex = next.indexOf(widget.id);
                      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedId);
                      return next;
                    });
                    setDraggedId(null);
                  }}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded border bg-card p-2",
                    dataState === "empty"
                      ? "border-dashed border-red-500/45 bg-red-500/5"
                      : dataState === "degraded"
                        ? "border-dashed border-amber-500/40 bg-amber-500/5"
                        : "border-border",
                  )}
                  style={{
                    gridColumn: `span ${spanW} / span ${spanW}`,
                    gridRow: `span ${layout.h} / span ${layout.h}`,
                    cursor: grouping === "manual" ? "grab" : "default",
                  }}
                >
                  <div className={cn("mb-1 overflow-hidden", compactCard ? "space-y-0.5" : "space-y-1")} style={{ maxHeight: headerMaxHeight }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className={cn("line-clamp-1 font-semibold leading-tight", compactCard ? "text-sm" : "text-base")}>{widget.title}</h3>
                        {!compactCard && !isDenseCard ? <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{widget.subtitle}</p> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setHeroPins((current) => {
                              if (current.includes(widget.id)) return current;
                              return [...current, widget.id].slice(-4);
                            })
                          }
                          className="rounded border border-border px-1 py-0 text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                          title="Pin to hero"
                        >
                          <Pin size={11} />
                        </button>
                        <button
                          onClick={() => {
                            setDebugProviderId(null);
                            setDebugWidgetId(widget.id);
                          }}
                          className="rounded border border-border px-1 py-0 text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                          title="Provider debug"
                        >
                          <Info size={11} />
                        </button>
                        <button
                          onClick={() =>
                            setRenderModeById((current) => ({
                              ...current,
                              [widget.id]: nextRenderMode(current[widget.id] || "auto"),
                            }))
                          }
                          className="rounded border border-border px-1 py-0 text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                          title="Switch render mode: auto/metric/spark/bar/list"
                        >
                          {(renderModeById[widget.id] || "auto").slice(0, 1)}
                        </button>
                        <button
                          onClick={() => {
                            setHiddenIds((current) => (current.includes(widget.id) ? current : [...current, widget.id]));
                            if (widget.id.startsWith("CUSTOM_")) {
                              setCustomWidgets((current) => current.filter((item) => item.id !== widget.id));
                            }
                          }}
                          className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:border-red-400 hover:text-red-300"
                          aria-label="Hide widget"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <div className={cn("flex items-center gap-1 text-[9px]", compactCard ? "mb-0.5" : "mb-1")}>
                      {!isDenseCard ? <span className={cn("rounded border px-1 py-0 uppercase tracking-[0.1em]", cardTypeTone(cardType))}>{cardType}</span> : null}
                      <span className={cn("rounded border px-1 py-0 uppercase tracking-[0.1em]", getStatusTone(widget.status))}>{widget.status}</span>
                      <span className={cn("rounded border px-1 py-0 uppercase tracking-[0.1em]", completenessTone(completenessScore))}>
                        data {completenessScore}
                      </span>
                      {staleBadge ? (
                        <span className="rounded border border-amber-500/70 bg-amber-500/10 px-1 py-0 uppercase tracking-[0.1em] text-amber-300">
                          stale {staleBadge}
                        </span>
                      ) : null}
                      {dataState === "empty" ? (
                        <span className="rounded border border-red-500/60 bg-red-500/10 px-1 py-0 uppercase tracking-[0.1em] text-red-300">gap</span>
                      ) : null}
                      {!compactCard || !isDenseCard ? (
                        <span className="max-w-[42%] truncate rounded border border-border px-1 py-0 text-muted-foreground">{widget.source}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="monitor-widget-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                    {(() => {
                      const modeOverride = renderModeById[widget.id] || "auto";
                      const mode: RenderMode = modeOverride === "auto" ? inferRenderMode(widget) : modeOverride;
                      const maxRows = dataState === "live"
                        ? (layout.h === 2 ? (isDenseCard ? 10 : 7) : (isDenseCard ? 6 : 4))
                        : (layout.h === 2 ? 10 : 7);
                      const rawItems = prioritizeMetricsForCard(widget.metrics, cardType).slice(0, maxRows + 2);
                      const fallbackRows = buildDataFirstFallbackRows(widget, dataState, providerDebug);
                      const baseItems =
                        rawItems.length > 0
                          ? rawItems
                          : [{ label: "Status", value: isDegradedStatus(widget.status) ? "No live numeric metrics" : "No numeric metrics yet" }];
                      const usableBase = baseItems.filter(metricLooksUsable);
                      const items = (
                        fallbackRows.length > 0
                          ? usableBase.length > 0
                            ? [...usableBase, ...fallbackRows]
                            : [...fallbackRows, ...baseItems]
                          : baseItems
                      ).slice(0, maxRows);
                      if (mode === "list") {
                        const rowMinHeight = isDenseCard ? "min-h-[34px]" : "min-h-[46px]";
                        return items.map((metric) => (
                          <button
                            key={`${widget.id}-${metric.label}`}
                            onClick={() =>
                              setSelectedMetric({
                                widgetTitle: widget.title,
                                widgetSource: widget.source,
                                widgetStatus: widget.status,
                                metricLabel: metric.label,
                                metricValue: metric.value,
                                metricDelta: metric.delta,
                                metricDeltaFormat: metric.deltaFormat,
                                href: metric.href,
                              })
                            }
                            className={cn("block w-full rounded border border-border bg-muted/10 p-1.5 text-left hover:border-primary/50", rowMinHeight)}
                          >
                            {cardType === "news" ? (
                              <>
                                <div className="line-clamp-2 text-xs leading-tight">{metric.label}</div>
                                <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{metric.value}</div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2 text-xs">
                                  <span className="line-clamp-1">{metric.label}</span>
                                  <span className={cn(typeof metric.delta === "number" && metric.delta >= 0 ? "text-emerald-400" : "text-red-400")}>
                                    {typeof metric.delta === "number"
                                      ? metric.deltaFormat === "abs"
                                        ? `${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(2)}`
                                        : `${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(2)}%`
                                      : "n/a"}
                                  </span>
                                </div>
                                <div className={cn("text-xs text-muted-foreground", isDenseCard ? "mt-0.5 line-clamp-1" : "mt-1")}>{metric.value}</div>
                              </>
                            )}
                          </button>
                        ));
                      }
                      if (mode === "bar") {
                        const valueSamples = items
                          .map((metric) => parseMetricNumber(metric.value))
                          .filter((value): value is number => value !== null);
                        const maxValue = valueSamples.length ? Math.max(...valueSamples) : 0;
                        return items.map((metric) => {
                          const parsedValue = parseMetricNumber(metric.value);
                          const fromDelta = typeof metric.delta === "number" ? Math.min(100, Math.max(6, Math.abs(metric.delta) * 8)) : null;
                          const fromValue =
                            parsedValue !== null && maxValue > 0 ? Math.min(100, Math.max(8, (parsedValue / maxValue) * 100)) : null;
                          const width = fromDelta ?? fromValue ?? 8;
                          return (
                            <button
                              key={`${widget.id}-${metric.label}`}
                              onClick={() =>
                                setSelectedMetric({
                                  widgetTitle: widget.title,
                                  widgetSource: widget.source,
                                  widgetStatus: widget.status,
                                  metricLabel: metric.label,
                                  metricValue: metric.value,
                                  metricDelta: metric.delta,
                                  metricDeltaFormat: metric.deltaFormat,
                                  href: metric.href,
                                })
                              }
                              className={cn(
                                "block w-full rounded border border-border bg-muted/10 p-1.5 text-left hover:border-primary/50",
                                isDenseCard ? "min-h-[40px]" : "min-h-[48px]",
                              )}
                            >
                              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                <span>{metric.label}</span>
                                <span>{metric.value}</span>
                              </div>
                              <div className="mt-1 h-1.5 rounded bg-muted">
                                <div
                                  className={cn("h-1.5 rounded", (metric.delta || 0) >= 0 ? "bg-emerald-500" : "bg-red-500")}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                            </button>
                          );
                        });
                      }
                      if (mode === "spark") {
                        const values = miniSparkValues(widget);
                        const min = Math.min(...values);
                        const max = Math.max(...values);
                        const normalized = values.map((value) => (max === min ? 50 : ((value - min) / (max - min)) * 100));
                        const points = normalized.map((value, idx) => `${idx * (100 / Math.max(1, normalized.length - 1))},${100 - value}`).join(" ");
                        return (
                          <button
                            key={`${widget.id}-spark`}
                            onClick={() =>
                              setSelectedMetric({
                                widgetTitle: widget.title,
                                widgetSource: widget.source,
                                widgetStatus: widget.status,
                                metricLabel: widget.metrics[0]?.label || "Metric",
                                metricValue: widget.metrics[0]?.value || "n/a",
                                metricDelta: widget.metrics[0]?.delta,
                                metricDeltaFormat: widget.metrics[0]?.deltaFormat,
                                href: widget.metrics[0]?.href,
                              })
                            }
                            className={cn(
                              "block w-full rounded border border-border bg-muted/10 p-1.5 text-left hover:border-primary/50",
                              isDenseCard ? "min-h-[72px]" : "min-h-[88px]",
                            )}
                          >
                            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Trend</div>
                            <svg viewBox="0 0 100 100" className="h-12 w-full">
                              <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} className="text-cyan-400" />
                            </svg>
                            <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                              {items.slice(0, 2).map((metric) => (
                                <div key={`${widget.id}-${metric.label}`} className="min-h-[38px] rounded border border-border px-1 py-0.5">
                                  <div className="truncate text-[10px] text-muted-foreground">{metric.label}</div>
                                  <div className="font-semibold">{metric.value}</div>
                                </div>
                              ))}
                            </div>
                          </button>
                        );
                      }
                      return items.map((metric) => (
                        <button
                          key={`${widget.id}-${metric.label}`}
                          onClick={() =>
                            setSelectedMetric({
                              widgetTitle: widget.title,
                              widgetSource: widget.source,
                              widgetStatus: widget.status,
                              metricLabel: metric.label,
                              metricValue: metric.value,
                              metricDelta: metric.delta,
                              metricDeltaFormat: metric.deltaFormat,
                              href: metric.href,
                            })
                          }
                          className={cn(
                            "block w-full rounded border border-border bg-muted/10 p-1.5 text-left hover:border-primary/50",
                            isDenseCard ? "min-h-[40px]" : "min-h-[48px]",
                          )}
                        >
                          <div className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</div>
                          <div className="text-sm font-semibold">{metric.value}</div>
                          {typeof metric.delta === "number" ? (
                            <div className={cn("text-[11px]", metric.delta >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {metric.delta >= 0 ? "+" : ""}
                              {metric.delta.toFixed(2)}
                              {metric.deltaFormat === "abs" ? "" : "%"}
                            </div>
                          ) : null}
                        </button>
                      ));
                    })()}
                  </div>
                  <div className="pointer-events-none absolute bottom-2 left-2 right-2 h-5 bg-gradient-to-t from-card via-card/80 to-transparent" />

                  <button
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX;
                      const onMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientX - startX;
                        if (Math.abs(delta) < 42) return;
                        resizeWidget(widget.id, "w", delta > 0 ? 1 : -1);
                        cleanup();
                      };
                      const cleanup = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", cleanup);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", cleanup);
                    }}
                  />
                  <button
                    className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startY = event.clientY;
                      const onMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientY - startY;
                        if (Math.abs(delta) < 42) return;
                        resizeWidget(widget.id, "h", delta > 0 ? 1 : -1);
                        cleanup();
                      };
                      const cleanup = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", cleanup);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", cleanup);
                    }}
                  />
                </article>
              );
            })}
          </div>

          {showHidden && hiddenIds.length > 0 ? (
            <div className="mt-2 rounded border border-border bg-card p-2">
              <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Hidden widgets</div>
              <div className="flex flex-wrap gap-1.5">
                {hiddenIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => setHiddenIds((current) => current.filter((item) => item !== id))}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Restore {widgetMap[id]?.title || id}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {showHealthPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 p-0">
          <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">Provider Health Panel</h3>
              <button
                onClick={() => setShowHealthPanel(false)}
                className="rounded border border-border px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-[0.12em]">
              <button
                onClick={() => setHealthFilter("all")}
                className={cn(
                  "rounded border px-1.5 py-0.5",
                  healthFilter === "all" ? "border-primary/70 bg-primary/15 text-primary" : "border-border text-muted-foreground",
                )}
              >
                all {providerHealthRows.length}
              </button>
              <button
                onClick={() => setHealthFilter("live")}
                className={cn(
                  "rounded border px-1.5 py-0.5",
                  healthFilter === "live" ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-emerald-500/40 text-emerald-300/80",
                )}
              >
                live {providerHealthRows.filter((row) => row.state === "live").length}
              </button>
              <button
                onClick={() => setHealthFilter("degraded")}
                className={cn(
                  "rounded border px-1.5 py-0.5",
                  healthFilter === "degraded" ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-amber-500/40 text-amber-300/80",
                )}
              >
                degraded {providerHealthRows.filter((row) => row.state === "degraded").length}
              </button>
              <button
                onClick={() => setHealthFilter("empty")}
                className={cn(
                  "rounded border px-1.5 py-0.5",
                  healthFilter === "empty" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-red-500/40 text-red-300/80",
                )}
              >
                empty {providerHealthRows.filter((row) => row.state === "empty").length}
              </button>
            </div>

            <div className="grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto_auto] gap-2 border-b border-border px-1 pb-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              <span>provider</span>
              <span>state</span>
              <span>mapped</span>
              <span>error</span>
              <span>fresh</span>
            </div>
            <div className="mt-1 space-y-1">
              {(healthFilter === "all" ? providerHealthRows : providerHealthRows.filter((row) => row.state === healthFilter)).map((row) => (
                <button
                  key={`provider-health-panel-${row.providerId}`}
                  onClick={() => {
                    openProviderDebug(row.providerId);
                    setShowHealthPanel(false);
                  }}
                  className="grid w-full grid-cols-[minmax(0,1.2fr)_auto_auto_auto_auto] items-center gap-2 rounded border border-border px-1.5 py-1 text-left text-[10px] hover:border-cyan-500/60 hover:bg-cyan-500/5"
                >
                  <span className="truncate font-medium">{row.providerId}</span>
                  <span
                    className={cn(
                      "rounded border px-1 py-0 uppercase tracking-[0.1em]",
                      row.state === "live"
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                        : row.state === "degraded"
                          ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                          : "border-red-500/60 bg-red-500/10 text-red-300",
                    )}
                  >
                    {row.state}
                  </span>
                  <span>{row.mapped}</span>
                  <span className="truncate">{row.errorKind}{row.httpStatus ? `:${row.httpStatus}` : ""}</span>
                  <span>{formatAgeShort(row.lastFetchAt)}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {isAddWidgetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Add custom widget</h3>
              <button
                onClick={() => setIsAddWidgetOpen(false)}
                className="rounded border border-border px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Title</label>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder="Widget title"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Subtitle</label>
                <input
                  value={draft.subtitle}
                  onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder="What this widget tracks"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Source</label>
                  <input
                    value={draft.source}
                    onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="API / RSS / Manual"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Topic</label>
                  <select
                    value={draft.topic}
                    onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value as CustomWidgetDraft["topic"] }))}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="markets">Markets</option>
                    <option value="logistics">Logistics</option>
                    <option value="policy">Policy</option>
                    <option value="weather">Weather</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setIsAddWidgetOpen(false)} className="rounded border border-border px-3 py-1 text-sm text-muted-foreground">
                Cancel
              </button>
              <button onClick={addCustomWidget} className="rounded border border-primary/60 bg-primary/15 px-3 py-1 text-sm text-primary">
                Add widget
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedMetric ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{selectedMetric.widgetTitle}</h3>
              <button
                onClick={() => setSelectedMetric(null)}
                className="rounded border border-border px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="rounded border border-border bg-muted/10 p-2">
                <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Metric</div>
                <div className="mt-1 font-semibold">{selectedMetric.metricLabel}</div>
                <div className="text-lg">{selectedMetric.metricValue}</div>
                {typeof selectedMetric.metricDelta === "number" ? (
                  <div className={cn("text-xs", selectedMetric.metricDelta >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {selectedMetric.metricDelta >= 0 ? "+" : ""}
                    {selectedMetric.metricDelta.toFixed(2)}
                    {selectedMetric.metricDeltaFormat === "abs" ? "" : "%"}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border bg-muted/10 p-2">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Source</div>
                  <div className="mt-1 text-sm">{selectedMetric.widgetSource}</div>
                </div>
                <div className="rounded border border-border bg-muted/10 p-2">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</div>
                  <div className="mt-1 text-sm">{selectedMetric.widgetStatus}</div>
                </div>
              </div>
              {selectedMetric.href ? (
                <a
                  href={selectedMetric.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded border border-primary/60 bg-primary/15 px-3 py-1 text-xs text-primary"
                >
                  Open source
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {debugWidgetId || debugProviderId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 p-0">
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Provider Debug</h3>
              <button
                onClick={() => {
                  setDebugWidgetId(null);
                  setDebugProviderId(null);
                }}
                className="rounded border border-border px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
            {(() => {
              const widget = debugWidgetId ? widgetMap[debugWidgetId] : null;
              const debug = (debugWidgetId ? providerDebugByWidgetId[debugWidgetId] : null) || (debugProviderId ? providerById[debugProviderId] : null);
              const providerId = debug?.providerId || debugProviderId || (widget ? WIDGET_KIND_TO_PROVIDER[widget.id.replace(/^GW_/, "")] : null);
              return (
                <div className="space-y-2 text-sm">
                  {widget ? (
                    <div className="rounded border border-border bg-muted/10 p-2">
                      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Widget</div>
                      <div className="mt-1 font-semibold">{widget.title}</div>
                      <div className="text-xs text-muted-foreground">{widget.id}</div>
                    </div>
                  ) : null}
                  {!debug ? (
                    <div className="rounded border border-border bg-muted/10 p-2 text-muted-foreground">
                      No provider debug payload found for {providerId || "selected target"}.
                    </div>
                  ) : (
                    <>
                      {!widget ? (
                        <div className="rounded border border-border bg-muted/10 p-2">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Provider target</div>
                          <div className="mt-1 font-semibold">{providerId || "n/a"}</div>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded border border-border bg-muted/10 p-2">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Provider</div>
                          <div className="mt-1">{debug.providerId}</div>
                        </div>
                        <div className="rounded border border-border bg-muted/10 p-2">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</div>
                          <div className="mt-1">{debug.status || "n/a"}</div>
                        </div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">lastFetchAt</div>
                        <div className="mt-1 break-all">{debug.lastFetchAt || "n/a"}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">httpStatus</div>
                        <div className="mt-1">{debug.httpStatus ?? debug.lastError?.httpStatus ?? "n/a"}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">errorKind</div>
                        <div className="mt-1">{debug.lastError?.errorKind || "none"}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">finalUrl</div>
                        <div className="mt-1 break-all">{debug.finalUrl || "n/a"}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">sourceUrlUsed</div>
                        <div className="mt-1 break-all">{debug.sourceUrlUsed || "n/a"}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">lastError.message</div>
                        <div className="mt-1 whitespace-pre-wrap break-words">{debug.lastError?.message || "n/a"}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/10 p-2">
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">notes</div>
                        <div className="mt-1 whitespace-pre-wrap break-words">{(debug.notes || []).join("\n") || "n/a"}</div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
