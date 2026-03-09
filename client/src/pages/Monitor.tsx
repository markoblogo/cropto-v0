import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, ShieldAlert, TrendingDown, TrendingUp, Waves, TrainFront, Activity, Eye, EyeOff, LayoutGrid, Tv, X, Filter } from "lucide-react";
import { DeckEcosystemStrip } from "@/components/deck/DeckEcosystemStrip";
import { MonitorFooter } from "@/components/monitor/MonitorFooter";
import { MonitorHeader } from "@/components/monitor/MonitorHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LiveVisualsPanel } from "@/components/monitor/LiveVisualsPanel";
import { MiniSparkline as MiniSparklineSvg } from "@/components/monitor/MiniSparkline";
import { MiniTrendMarker } from "@/components/monitor/MiniTrendMarker";
import { MetricChip } from "@/components/monitor/MetricChip";
import { StatusSourceStrip } from "@/components/monitor/StatusSourceStrip";
import { IntensityBar } from "@/components/monitor/IntensityBar";
import { WorldTimeDrawer } from "@/components/monitor/WorldTimeDrawer";
import { getMiniTrendRenderMode } from "@/components/monitor/miniTrendRelevance";
import {
  getCardSizeClass,
  getSectionTrendPolicy,
  getTrendSlotClass,
  resolveCardSizeVariant,
  type MonitorCardKind,
  type MonitorSectionLayer,
  type CardSizeVariant,
} from "@/components/monitor/uiRules";
import {
  formatChangeWithUnit,
  formatFxRate,
  formatIndexPoints,
  formatMetricValue,
  formatNumber,
  formatPercent,
  formatPriceWithUnit,
} from "@/components/monitor/formatters";

type MonitorItem = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source_name: string;
  published_at: string;
  topic_tags: string[];
  crop_tags: string[];
  region_tags: string[];
  relevance_score: number;
};

type MonitorResponse = {
  generatedAt: string;
  filters: {
    threshold?: number;
  };
  topSignals: MonitorItem[];
  feed: MonitorItem[];
  sidePanels: { logistics: MonitorItem[]; policy: MonitorItem[] };
};

type MonitorIndex = {
  slug: string;
  name: string;
  value: number;
  change?: number;
  updatedAt: string;
  source: string;
};

type IndicesResponse = {
  enabled: boolean;
  items: MonitorIndex[];
  note?: string;
};

type FxResponse = {
  enabled: boolean;
  mode: "live" | "coming_soon";
  message?: string;
  asOf?: string;
  source?: string;
  rates: Array<{ currency: string; usdPerUnit: number }>;
};

type DebugResponse = {
  generatedAt: string;
  sourcesTotal: number;
  sourcesEnabled: number;
  itemsFetchedLast24h: number;
  itemsAfterFiltering: number;
  duplicatesRemoved: number;
  topSourcesByRelevantItems: Array<{ sourceId: string; count: number }>;
  noisySources: Array<{ sourceId: string; count: number }>;
  liveVisuals?: {
    total: number;
    enabled: number;
    active: number;
    disabled: number;
    fallback: number;
    shownSourceIds: string[];
  };
  logisticsIndicators?: {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    providers: Array<{
      id: string;
      enabled: boolean;
      status: string;
      cacheAgeSec?: number;
      lastSuccessAt?: string;
      fallbackMode: boolean;
      lastError?: string;
    }>;
  };
  grainMarkets?: {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    fxRateUsed?: number;
    normalization?: {
      defaults: {
        price: "USD/t";
        temperature: "C";
      };
      fxRateUsed?: number;
      normalizedCount: number;
      nativeFallbackCount: number;
    };
    providers: Array<{
      providerId: string;
      providerType?: string;
      enabled: boolean;
      status: string;
      cacheAgeSec?: number;
      lastSuccessAt?: string;
      fallbackUsed?: boolean;
      error?: string;
    }>;
  };
  grainWidgets?: {
    enabled: boolean;
    refreshMs: number;
    cacheTtlMs: number;
    providers: Array<{
      providerId: string;
      kind: GrainWidgetKind;
      enabled: boolean;
      status: string;
      cacheAgeSec?: number;
      lastSuccessAt?: string;
      fallbackUsed?: boolean;
      error?: string;
    }>;
    normalization?: {
      defaults: {
        price: "USD/t";
        temperature: "C";
      };
      fxRateUsed?: number;
      normalizedCount: number;
      nativeFallbackCount: number;
    };
  };
};

type LogisticsIndicator = {
  id: string;
  type: "bdi" | "rail_tariff" | "logistics_pressure";
  title: string;
  subtitle: string;
  unit: string;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  status: "LIVE" | "REFRESH" | "DELAYED" | "FALLBACK" | "OFFLINE";
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  updatedAt?: string;
  timeframe: string;
  trendLabel: "Rising" | "Building" | "Stable" | "Cooling" | "Easing" | "Elevated";
  level?: "Low" | "Moderate" | "Elevated" | "High" | "Severe";
  explanation?: string;
  components?: {
    eventIntensity: number;
    blackSeaFocus: number;
    frictionFactors: number;
    transportContext: number;
    confidence: number;
  };
  series: Array<{ ts: string; value: number }>;
  notes?: string[];
  fallbackReason?: string;
};

type LogisticsIndicatorsResponse = {
  enabled: boolean;
  widgets: LogisticsIndicator[];
  meta: {
    generatedAt: string;
    cacheAgeSec?: number;
    partialFailure?: boolean;
  };
  message?: string;
};

type GrainWidgetStatus = "LIVE" | "REFRESH" | "DELAYED" | "INDICATIVE" | "FALLBACK" | "OFFLINE";

type GrainInstrumentWidget = {
  instrumentKey: string;
  venue: "CBOT" | "EURONEXT";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  updatedAt?: string;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  timeframe: "1d" | "7d";
  currency?: string;
  unit?: string;
  nativeValueCurrent?: number;
  nativeValueChange?: number;
  nativeValueChangePct?: number;
  nativeCurrency?: string;
  nativeUnit?: string;
  normalizedValueCurrent?: number;
  normalizedValueChange?: number;
  normalizedValueChangePct?: number;
  normalizedCurrency?: "USD";
  normalizedUnit?: "t";
  normalizationStatus?: "OK" | "PARTIAL" | "FX_MISSING" | "UNAVAILABLE";
  normalizationMethod?: string;
  normalizationMeta?: {
    fxRateUsed?: number;
    bushelsPerTon?: number;
    cropFactor?: string;
    notes?: string[];
  };
  series: Array<{ ts: string; value: number }>;
  fallbackReason?: string;
};

type GrainComparisonWidget = {
  id: string;
  title: string;
  status: GrainWidgetStatus;
  sourceAttribution?: string;
  leftLabel: string;
  rightLabel: string;
  comparisonType: "same-family" | "proxy";
  spreadAbs?: number;
  spreadUnit?: string;
  spreadPct?: number;
  leftChangePct?: number;
  rightChangePct?: number;
  relativeMoveSignal: "US outperforming" | "EU outperforming" | "Mixed" | "Flat" | "Unavailable";
  trendLabel?: "Rising" | "Cooling" | "Stable" | "Mixed";
  note: string;
  updatedAt: string;
  fallbackReason?: string;
};

type GrainMarketsResponse = {
  enabled?: boolean;
  widgets: {
    cbot: GrainInstrumentWidget[];
    euronext: GrainInstrumentWidget[];
    comparisons: GrainComparisonWidget[];
  };
  meta: {
    generatedAt: string;
    cacheAgeSec?: number;
    partialFailure?: boolean;
    fxRateUsed?: number;
    normalizationCoverage?: {
      ok: number;
      partial: number;
      fxMissing: number;
      unavailable: number;
    };
  };
  debug?: {
    providers: Array<{
      providerId: string;
      providerType?: string;
      enabled: boolean;
      status: string;
      fallbackUsed?: boolean;
      error?: string;
    }>;
  };
  message?: string;
};

type GrainWidgetKind =
  | "US_CASH_BIDS"
  | "GLOBAL_SPOT_TABLE"
  | "CROP_PRICE_INDEX"
  | "CBOT_FUTURES_SNAPSHOT"
  | "CBOT_FUTURES_CURVE"
  | "LIVESTOCK_FEED_TIEIN"
  | "MACRO_AGRI_INDICES"
  | "USDA_MARS_REPORTS"
  | "US_CASH_EXPORT_CONTEXT"
  | "USDA_MARS_DAILY_MARKET_RATES_TXT"
  | "ALPHAVANTAGE_GRAIN_BENCHMARKS"
  | "NASDAQ_DATA_LINK_SNAPSHOT"
  | "EC_CEREALS_MULTI_COUNTRY"
  | "EC_OILSEEDS_MULTI_COUNTRY"
  | "USDA_NASS_PRODUCER_PRICES"
  | "WFP_MARKET_PRICES_MULTI_COUNTRY"
  | "WB_MICRODATA_MARKET_PRICES"
  | "EUROSTAT_AGRI_PRICE_INDICES"
  | "USDA_PSD_BALANCES"
  | "AMIS_GLOBAL_BALANCE"
  | "IMF_COMMODITY_BENCHMARKS"
  | "OECD_AGRICULTURAL_OUTLOOK"
  | "USDA_GTR_LOGISTICS_SNAPSHOT"
  | "CANADA_GRAIN_RAIL_PERFORMANCE"
  | "FAOSTAT_PP_MULTI_COUNTRY"
  | "FPMA_MARKET_PRICES_MULTI_COUNTRY";

type GrainTerritoryMeta = {
  territoryScope?: "GLOBAL" | "COUNTRY_FIXED" | "COUNTRY_MULTI";
  territory?: { code: string; label: string };
  supportedTerritories?: Array<{ code: string; label: string }>;
  territorySelector?: {
    paramName: "country";
    default: string;
    current: string;
    persistKey: string;
  };
};

type GrainWidgetTableCellPrice = {
  nativeValueCurrent?: number;
  nativeValueChange?: number;
  nativeValueChangePct?: number;
  nativeCurrency?: string;
  nativeUnit?: string;
  normalizedValueCurrent?: number;
  normalizedValueChange?: number;
  normalizedValueChangePct?: number;
  normalizedCurrency?: "USD";
  normalizedUnit?: "t";
  normalizationStatus: "OK" | "PARTIAL" | "FX_MISSING" | "UNAVAILABLE";
  normalizationMethod?: string;
  series?: Array<{ ts: string; value: number }>;
};

type GrainWidgetRow = {
  id: string;
  label: string;
  sublabel?: string;
  region?: string;
  commodityGroup?: "Grains" | "Oilseeds" | "Composite";
  price?: GrainWidgetTableCellPrice;
  status?: GrainWidgetStatus;
  sourceName?: string;
  sourceAttribution?: string;
  updatedAt?: string;
  tags?: string[];
  notes?: string[];
  territory?: { code: string; label: string };
};

type GrainWidgetCashBids = GrainTerritoryMeta & {
  id: string;
  kind: "US_CASH_BIDS";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: GrainWidgetRow[];
  summary?: {
    rowCount: number;
    normalizedCoverage?: {
      ok: number;
      partial: number;
      fxMissing: number;
      unavailable: number;
    };
    spreadCue?: {
      min?: number;
      max?: number;
      range?: number;
      unit?: string;
      label?: string;
    };
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetGlobalSpot = GrainTerritoryMeta & {
  id: string;
  kind: "GLOBAL_SPOT_TABLE";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: GrainWidgetRow[];
  summary?: {
    rowCount: number;
    momentumLabel?: "Firm" | "Soft" | "Mixed" | "Flat";
    normalizedCoverage?: {
      ok: number;
      partial: number;
      fxMissing: number;
      unavailable: number;
    };
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetCropIndex = GrainTerritoryMeta & {
  id: string;
  kind: "CROP_PRICE_INDEX";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  cards: Array<{
    id: string;
    label: string;
    value?: number;
    valueText?: string;
    delta?: number;
    deltaPct?: number;
    status?: GrainWidgetStatus;
    series?: Array<{ ts: string; value: number }>;
  }>;
  rows?: GrainWidgetRow[];
  weatherTieIn?: {
    available: boolean;
    label?: string;
    score?: number;
    status?: GrainWidgetStatus;
    notes?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetFuturesSnapshot = GrainTerritoryMeta & {
  id: string;
  kind: "CBOT_FUTURES_SNAPSHOT";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: GrainWidgetRow[];
  summary?: {
    contractsParsed?: number;
    parseMode?: "snapshot" | "curve-lite";
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetLivestockFeedTieIn = GrainTerritoryMeta & {
  id: string;
  kind: "LIVESTOCK_FEED_TIEIN";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: GrainWidgetRow[];
  summary?: {
    rowCount: number;
    derivedCue?: {
      label: "Feed demand supportive" | "Mixed" | "Soft" | "Unavailable";
      score?: number;
      status?: GrainWidgetStatus;
      notes?: string[];
    };
    normalizedCoverage?: {
      ok: number;
      partial: number;
      fxMissing: number;
      unavailable: number;
    };
  };
  fallbackReason?: string;
};

type GrainWidgetMacroAgriIndices = GrainTerritoryMeta & {
  id: string;
  kind: "MACRO_AGRI_INDICES";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  renderMode: "api_series" | "embed" | "fallback";
  items?: Array<{
    id: string;
    label: string;
    metricSemanticKind: "price" | "index" | "composite" | "signal";
    status?: GrainWidgetStatus;
    sourceName?: string;
    price?: GrainWidgetTableCellPrice;
    valueCurrent?: number;
    valueChange?: number;
    valueChangePct?: number;
    unitLabel?: string;
    series?: Array<{ ts: string; value: number }>;
    notes?: string[];
  }>;
  cards?: Array<{
    id: string;
    label: string;
    value?: number;
    valueText?: string;
    deltaPct?: number;
    status?: GrainWidgetStatus;
    series?: Array<{ ts: string; value: number }>;
  }>;
  embed?: {
    enabled: boolean;
    status: "AVAILABLE" | "BLOCKED" | "DISABLED" | "UNAVAILABLE";
    providerName: string;
    title?: string;
    embedUrl?: string;
    externalUrl?: string;
    notes?: string[];
  };
  summary?: {
    itemCount: number;
    momentumLabel?: "Firm" | "Soft" | "Mixed" | "Flat" | "Unavailable";
    renderMode: "api_series" | "embed" | "fallback";
    modeReason?: string;
  };
  fallbackReason?: string;
};

type GrainWidgetUsdaMarsReports = GrainTerritoryMeta & {
  id: string;
  kind: "USDA_MARS_REPORTS";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  reports: Array<{
    id: string;
    title: string;
    publishedAt?: string;
    reportDate?: string;
    reportId?: string;
    fileType?: "PDF" | "TXT" | "HTML" | "OTHER";
    category?: string;
    score?: number;
    tags?: {
      region?: string;
      type?: string;
      crops?: string[];
    };
    sourceUrl?: string;
    notes?: string[];
  }>;
  summary?: {
    fetchedCount: number;
    scannedCount?: number;
    matchedCount: number;
    excludedCount?: number;
    shownCount: number;
    reportsReturnedTop?: number;
    moreReportsCount?: number;
    topScoreMin?: number;
    topScoreMax?: number;
    categories?: Array<{ label: string; count: number }>;
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetUsCashExportContext = GrainTerritoryMeta & {
  id: string;
  kind: "US_CASH_EXPORT_CONTEXT";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  summary: {
    exportIndications: boolean;
    dailyBids: boolean;
    marketRates: boolean;
    reportsToday: number;
    regions: string[];
    cadenceHints?: string[];
  };
  topReports: Array<{
    id: string;
    title: string;
    publishedAt?: string;
    fileType?: "PDF" | "TXT" | "HTML" | "OTHER";
    regionTag?: string;
    typeTag?: string;
    url?: string;
  }>;
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetUsdaMarsDailyMarketRatesTxt = GrainTerritoryMeta & {
  id: string;
  kind: "USDA_MARS_DAILY_MARKET_RATES_TXT";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  report: {
    reportId: number;
    publishedAt?: string;
    fileName?: string;
    fileType: "txt";
    sourceUrl?: string;
  };
  rows: Array<{
    commodity: "WHEAT" | "CORN" | "SOY" | "OTHER";
    market?: string;
    label: string;
    price: {
      nativeValueCurrent: number;
      nativeUnit: string;
      normalizedValueCurrent?: number;
      normalizedUnit?: "USD/t";
    };
    change?: {
      nativeAbs?: number;
      nativePct?: number;
    };
    confidence: "HIGH" | "MED" | "LOW";
  }>;
  debug?: {
    linesFetched: number;
    linesMatched: number;
    parseMode: "strict";
    matchedSections?: string[];
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetAlphaVantageBenchmarks = GrainTerritoryMeta & {
  id: string;
  kind: "ALPHAVANTAGE_GRAIN_BENCHMARKS";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<GrainWidgetRow & {
    alphaFunction: string;
    unitConfidence: "CONFIRMED" | "ASSUMED" | "UNKNOWN";
    allowNormalization: boolean;
    momChangePct?: number;
    yoyChangePct?: number;
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "unknown";
    byFunction?: Array<{
      fn: string;
      unitLabel: string;
      unitConfidence: "CONFIRMED" | "ASSUMED" | "UNKNOWN";
      allowNormalization: boolean;
      seriesPoints: number;
      cacheHit?: boolean;
    }>;
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetNasdaqDataLinkSnapshot = GrainTerritoryMeta & {
  id: string;
  kind: "NASDAQ_DATA_LINK_SNAPSHOT";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  items: Array<{
    id: string;
    dataset: string;
    label: string;
    nativeValueCurrent?: number;
    nativeUnit: string;
    cadence?: string;
    frequency?: string;
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    unitConfidence: "CONFIRMED" | "ASSUMED" | "UNKNOWN";
    notes?: string[];
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    datasetStatuses?: Array<{
      dataset: string;
      status: "ok" | "error" | "forbidden" | "rate_limited" | "empty" | "parse_error";
      errorKind?: "DNS" | "TIMEOUT" | "HTTP_4XX" | "HTTP_5XX" | "PARSE" | "EMPTY" | "BLOCKED" | "RATE_LIMIT" | "UNKNOWN";
      sourceUrlUsed?: string;
      note?: string;
    }>;
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetEcOfficialPricesMultiCountry = GrainTerritoryMeta & {
  id: string;
  kind: "EC_CEREALS_MULTI_COUNTRY" | "EC_OILSEEDS_MULTI_COUNTRY";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<{
    crop:
      | "SOFT_WHEAT"
      | "DURUM_WHEAT"
      | "MAIZE"
      | "BARLEY"
      | "RYE"
      | "RAPESEED"
      | "SUNFLOWER"
      | "SOYBEANS";
    label: string;
    current: number;
    unit: string;
    cadence: "daily" | "weekly" | "monthly" | "annual" | "unknown";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
    territory?: { code: string; label: string };
    secondaryValueText?: string;
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "annual" | "unknown";
    selectedTerritory?: string;
    stageLabels?: string[];
  };
  debug?: {
    sourceUrlUsed?: string;
    query?: string;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetUsdaNassProducerPrices = GrainTerritoryMeta & {
  id: string;
  kind: "USDA_NASS_PRODUCER_PRICES";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<GrainWidgetRow & {
    crop?: "WHEAT" | "CORN" | "SOYBEANS";
    cadence?: "annual" | "monthly" | "unknown";
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "annual" | "monthly" | "unknown";
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetCountryMarketPricesMultiCountry = GrainTerritoryMeta & {
  id: string;
  kind: "WFP_MARKET_PRICES_MULTI_COUNTRY" | "WB_MICRODATA_MARKET_PRICES";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<{
    crop: "WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER";
    label: string;
    current: number;
    unit: string;
    currency?: string;
    cadence: "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "unknown";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
    territory?: { code: string; label: string };
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "unknown";
    selectedTerritory?: string;
  };
  debug?: {
    sourceUrlUsed?: string;
    query?: string;
    rowsParsed?: number;
    marketRule?: string;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetEurostatAgriPriceIndices = GrainTerritoryMeta & {
  id: string;
  kind: "EUROSTAT_AGRI_PRICE_INDICES";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  items: Array<{
    id: string;
    indexName: string;
    current: number;
    unit: string;
    cadence: "quarterly" | "annual" | "unknown";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "quarterly" | "annual" | "unknown";
    selectedTerritory?: string;
  };
  debug?: {
    sourceUrlUsed?: string;
    query?: string;
    rowsParsed?: number;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetUsdaGtrLogisticsSnapshot = GrainTerritoryMeta & {
  id: string;
  kind: "USDA_GTR_LOGISTICS_SNAPSHOT";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  items: Array<{
    metric: "BARGE" | "RAIL" | "OCEAN" | "FUEL" | "TRANSIT" | "OTHER";
    label: string;
    current: number;
    unit: string;
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "unknown";
  };
  debug?: {
    sourceUrlUsed?: string;
    rowsParsed?: number;
    parseWarnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetCanadaRailPerformance = GrainTerritoryMeta & {
  id: string;
  kind: "CANADA_GRAIN_RAIL_PERFORMANCE";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  items: Array<{
    metric: "LOADED_CARS" | "FULFILLMENT" | "DELAY" | "MOVEMENT" | "OTHER";
    label: string;
    current: number;
    unit: string;
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    cadence?: "weekly" | "monthly" | "unknown";
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "weekly" | "monthly" | "unknown";
  };
  debug?: {
    sourceUrlUsed?: string;
    rowsParsed?: number;
    query?: string;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetUsdaPsdBalances = GrainTerritoryMeta & {
  id: string;
  kind: "USDA_PSD_BALANCES";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<{
    commodity: "WHEAT" | "CORN" | "SOYBEANS" | "RAPESEED";
    metric: "PRODUCTION" | "CONSUMPTION" | "EXPORTS" | "ENDING_STOCKS";
    label: string;
    current: number;
    unit: string;
    cadence: "annual" | "marketing-year" | "unknown";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "annual" | "marketing-year" | "unknown";
    selectedView?: "WORLD";
  };
  debug?: {
    sourceUrlUsed?: string;
    query?: string;
    rowsParsed?: number;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetAmisGlobalBalance = GrainTerritoryMeta & {
  id: string;
  kind: "AMIS_GLOBAL_BALANCE";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  items: Array<{
    id: string;
    crop: "WHEAT" | "MAIZE" | "RICE" | "SOYBEANS";
    label: string;
    statusLabel?: string;
    releaseDate?: string;
    cadence: "release-based";
    notes?: string[];
    sourceUrl?: string;
  }>;
  summary?: {
    issueLabel?: string;
    releaseDate?: string;
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "release-based";
  };
  debug?: {
    sourceUrlUsed?: string;
    pdfUrl?: string;
    rowsParsed?: number;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetImfCommodityBenchmarks = GrainTerritoryMeta & {
  id: string;
  kind: "IMF_COMMODITY_BENCHMARKS";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<{
    commodity: "WHEAT" | "MAIZE" | "SOYBEANS" | "SUNFLOWER_OIL" | "RAPESEED_OIL";
    label: string;
    current: number;
    unit: string;
    cadence: "monthly";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "monthly";
  };
  debug?: {
    sourceUrlUsed?: string;
    rowsParsed?: number;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetOecdAgriculturalOutlook = GrainTerritoryMeta & {
  id: string;
  kind: "OECD_AGRICULTURAL_OUTLOOK";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  items: Array<{
    id: string;
    commodity: "WHEAT" | "MAIZE" | "SOYBEANS" | "RAPESEED" | "SUNFLOWER";
    label: string;
    projectedValue: number;
    unit: string;
    horizon: string;
    cadence: "annual";
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "annual";
    releaseDate?: string;
    horizon?: string;
  };
  debug?: {
    sourceUrlUsed?: string;
    rowsParsed?: number;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetFaostatPpMultiCountry = GrainTerritoryMeta & {
  id: string;
  kind: "FAOSTAT_PP_MULTI_COUNTRY";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  rows: Array<{
    crop: "WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER";
    label: string;
    current: number;
    unit: string;
    cadence: "monthly" | "annual";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
    territory?: { code: string; label: string };
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "monthly" | "annual" | "unknown";
    selectedTerritory?: string;
  };
  debug?: {
    sourceUrlUsed?: string;
    areaCodes?: string[];
    itemCodes?: string[];
    elementCode?: string;
    elementLabel?: string;
    observationsByCrop?: Array<{ crop: string; count: number }>;
    discoveryCacheHit?: boolean;
    query?: string;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidgetFpmaMarketPricesMultiCountry = GrainTerritoryMeta & {
  id: string;
  kind: "FPMA_MARKET_PRICES_MULTI_COUNTRY";
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  timeframe?: "1d" | "7d";
  selector?: {
    priceType?: {
      current: "RETAIL" | "WHOLESALE";
      options: Array<"RETAIL" | "WHOLESALE">;
    };
  };
  rows: Array<{
    crop: "WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER";
    label: string;
    current: number;
    unit: string;
    currency?: string;
    cadence: "monthly" | "weekly" | "annual" | "unknown";
    changeAbs?: number;
    changePct?: number;
    series?: Array<{ ts: string; value: number }>;
    confidence: "HIGH" | "MED" | "LOW";
    notes?: string[];
    territory?: { code: string; label: string };
  }>;
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "monthly" | "weekly" | "annual" | "unknown";
    selectedTerritory?: string;
    selectedPriceType?: "RETAIL" | "WHOLESALE";
  };
  debug?: {
    sourceUrlUsed?: string;
    countryQueryUsed?: string;
    commodityIdsUsed?: string[];
    rowsParsed?: number;
    query?: string;
    warnings?: string[];
  };
  notes?: string[];
  fallbackReason?: string;
};

type GrainWidget =
  | GrainWidgetCashBids
  | GrainWidgetGlobalSpot
  | GrainWidgetCropIndex
  | GrainWidgetFuturesSnapshot
  | GrainWidgetLivestockFeedTieIn
  | GrainWidgetMacroAgriIndices
  | GrainWidgetUsdaMarsReports
  | GrainWidgetUsCashExportContext
  | GrainWidgetUsdaMarsDailyMarketRatesTxt
  | GrainWidgetAlphaVantageBenchmarks
  | GrainWidgetNasdaqDataLinkSnapshot
  | GrainWidgetEcOfficialPricesMultiCountry
  | GrainWidgetUsdaNassProducerPrices
  | GrainWidgetCountryMarketPricesMultiCountry
  | GrainWidgetEurostatAgriPriceIndices
  | GrainWidgetUsdaPsdBalances
  | GrainWidgetAmisGlobalBalance
  | GrainWidgetImfCommodityBenchmarks
  | GrainWidgetOecdAgriculturalOutlook
  | GrainWidgetUsdaGtrLogisticsSnapshot
  | GrainWidgetCanadaRailPerformance
  | GrainWidgetFaostatPpMultiCountry
  | GrainWidgetFpmaMarketPricesMultiCountry;

type GrainWidgetsResponse = {
  enabled?: boolean;
  widgets: {
    byKind: Partial<Record<GrainWidgetKind, GrainWidget>>;
    order: GrainWidgetKind[];
  };
  meta: {
    generatedAt: string;
    partialFailure: boolean;
    cacheAgeSec?: number;
    timeframe: "1d" | "7d";
    enabledWidgetKinds: GrainWidgetKind[];
    returnedWidgetKinds: GrainWidgetKind[];
    counts?: {
      totalWidgets: number;
      live: number;
      delayed: number;
      indicative: number;
      fallback: number;
      offline: number;
    };
    normalization?: {
      normalizedRowsOk: number;
      normalizedRowsPartial: number;
      fxMissing: number;
      unavailable: number;
      fxRateUsed?: number;
    };
  };
  debug?: {
    providers: Array<{
      providerId: string;
      providerType?: string;
      enabled: boolean;
      status: string;
      cacheAgeSec?: number;
      fallbackUsed?: boolean;
      error?: string;
    }>;
    normalization?: {
      fxRateUsed?: number;
      rowsByStatus?: {
        OK: number;
        PARTIAL: number;
        FX_MISSING: number;
        UNAVAILABLE: number;
      };
    };
  };
  message?: string;
};
type CompactSignalStatus = "Rising" | "Stable" | "Elevated" | "Cooling";

type CompactSignalWidget = {
  id: string;
  title: string;
  status: CompactSignalStatus;
  primary: string;
  secondary: string;
  note: string;
  series: Array<{ label: string; value: number }>;
};

type SignalType = "Harvest" | "Export" | "Logistics" | "Policy" | "Weather" | "Futures" | "Markets";
type Impact = "High" | "Medium" | "Low";
type PriceDisplayMode = "USD_TON" | "NATIVE";
type TemperatureDisplayMode = "C" | "F";

const CROPS = ["all", "wheat", "corn", "soy", "rapeseed", "sunflower", "barley", "oilseeds"] as const;
const TOPICS = ["all", "markets", "trade", "logistics", "weather", "policy", "harvest"] as const;
const REGIONS = ["all", "black sea", "eu", "us", "latam", "asia"] as const;
const HERO_CROPS = ["wheat", "corn", "soy", "rapeseed", "sunflower"] as const;
const MONITOR_NAV_ITEMS = [
  { href: "#overview", label: "Overview" },
  { href: "#grain-markets-core", label: "Grain Markets" },
  { href: "#grain-data-expansion", label: "Market Depth" },
  { href: "#top-signals", label: "Top Signals" },
  { href: "#terminal-panels", label: "Panels" },
  { href: "#logistics-indicators", label: "Logistics" },
] as const;

const COMMAND_PROFILES = [
  { id: "all", label: "Show All" },
  { id: "farmer", label: "Farmer" },
  { id: "trader", label: "Trader" },
  { id: "broker", label: "Broker" },
] as const;

const SECTION_STORAGE_KEY = "monitor_hidden_sections_v1";

const SECTION_LABELS = {
  "grain-markets-core": "Grain Markets Core",
  "grain-data-expansion": "Grain Data Expansion",
  "fundamentals-outlook": "Fundamentals & Outlook",
  "top-signals": "Top Signals",
  "logistics-indicators": "Freight & Logistics",
  "signal-charts": "Signal Charts",
  "signal-filters": "Signal Filters",
  "terminal-panels": "Terminal Panels",
} as const;

type CommandProfile = (typeof COMMAND_PROFILES)[number]["id"];
type SectionId = keyof typeof SECTION_LABELS;

type HeroCrop = (typeof HERO_CROPS)[number];

function asLabel(value: string): string {
  if (value === "black sea") return "Black Sea";
  if (value === "latam") return "LatAm";
  if (value === "us") return "US";
  if (value === "eu") return "EU";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "n/a";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function inLastHours(item: MonitorItem, hours: number): boolean {
  const ts = Date.parse(item.published_at);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= hours * 60 * 60 * 1000;
}

function inRegion(item: MonitorItem, region: string): boolean {
  const tags = item.region_tags.join(" ");
  if (region === "latam") return tags.includes("brazil") || tags.includes("argentina");
  if (region === "asia") return tags.includes("china") || tags.includes("india");
  return tags.includes(region);
}

function classifySignalType(item: MonitorItem): SignalType {
  const text = `${item.title} ${item.summary || ""}`.toLowerCase();
  const topics = new Set(item.topic_tags.map((t) => t.toLowerCase()));

  if (topics.has("harvest")) return "Harvest";
  if (topics.has("logistics")) return "Logistics";
  if (topics.has("policy")) return "Policy";
  if (topics.has("weather")) return "Weather";
  if (text.includes("futures") || text.includes("basis")) return "Futures";
  if (text.includes("export") || text.includes("import") || text.includes("tender") || topics.has("trade")) return "Export";
  return "Markets";
}

function classifyImpact(item: MonitorItem): Impact {
  const score = item.relevance_score;
  if (score >= 10) return "High";
  if (score >= 6) return "Medium";
  return "Low";
}

function whyItMatters(item: MonitorItem, signalType: SignalType): string {
  const crop = item.crop_tags[0] ? asLabel(item.crop_tags[0]) : "grain markets";
  const region = item.region_tags[0] ? asLabel(item.region_tags[0]) : "key corridors";

  switch (signalType) {
    case "Harvest":
      return `Harvest flow changes can shift near-term ${crop} availability and basis behavior.`;
    case "Export":
      return `Trade flow updates can reprice ${crop} routes and export competitiveness in ${region}.`;
    case "Logistics":
      return `Logistics friction can widen spreads and alter delivery assumptions for ${crop}.`;
    case "Policy":
      return `Policy changes can re-route risk and liquidity across ${region} markets.`;
    case "Weather":
      return `Weather stress may affect production expectations and risk premiums in ${region}.`;
    case "Futures":
      return `Futures/basis shifts can change hedge efficiency for ${crop} exposures.`;
    default:
      return `This signal can influence short-term pricing and hedge decisions for ${crop}.`;
  }
}

function SignalTag({ value, kind }: { value: string; kind: "crop" | "topic" | "region" }) {
  const base = "text-[10px] font-medium px-2 py-0.5 rounded-full border";
  const classes =
    kind === "crop"
      ? "border-emerald-500/45 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100"
      : kind === "region"
        ? "border-blue-500/45 bg-blue-500/12 text-blue-900 dark:text-blue-100"
        : "border-amber-500/45 bg-amber-500/12 text-amber-900 dark:text-amber-100";

  return <span className={`${base} ${classes}`}>{asLabel(value)}</span>;
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const styles =
    impact === "High"
      ? "border-red-500/55 bg-red-500/18 text-red-900 dark:text-red-100"
      : impact === "Medium"
        ? "border-amber-500/55 bg-amber-500/18 text-amber-900 dark:text-amber-100"
        : "border-emerald-500/55 bg-emerald-500/18 text-emerald-900 dark:text-emerald-100";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}>{impact}</span>;
}

function CommandChip({
  active,
  label,
  onClick,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
        active
          ? "border-primary/70 bg-primary text-primary-foreground shadow-sm"
          : "border-black/60 bg-background/80 text-foreground hover:border-primary/45 hover:bg-muted/70 dark:border-white/25 dark:bg-slate-950/70"
      }`}
    >
      {label}
    </button>
  );
}

function SectionHideButton({
  hidden,
  onClick,
}: {
  hidden?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      className="h-7 px-2 text-[10px] uppercase tracking-[0.12em] text-foreground/68 hover:text-foreground"
    >
      {hidden ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
      {hidden ? "Show" : "Hide"}
    </Button>
  );
}

function indicatorStatusClass(status: LogisticsIndicator["status"]) {
  if (status === "LIVE") return "border-emerald-500/45 bg-emerald-500/18 text-emerald-900 dark:text-emerald-100";
  if (status === "REFRESH") return "border-cyan-500/45 bg-cyan-500/18 text-cyan-900 dark:text-cyan-100";
  if (status === "DELAYED") return "border-amber-500/45 bg-amber-500/18 text-amber-900 dark:text-amber-100";
  if (status === "FALLBACK") return "border-blue-500/45 bg-blue-500/18 text-blue-900 dark:text-blue-100";
  return "border-red-500/45 bg-red-500/18 text-red-900 dark:text-red-100";
}

function indicatorStatusLabel(status: LogisticsIndicator["status"]) {
  return status;
}

function grainStatusClass(status: GrainWidgetStatus) {
  if (status === "LIVE") return "border-emerald-500/45 bg-emerald-500/18 text-emerald-900 dark:text-emerald-100";
  if (status === "REFRESH") return "border-cyan-500/45 bg-cyan-500/18 text-cyan-900 dark:text-cyan-100";
  if (status === "DELAYED") return "border-amber-500/45 bg-amber-500/18 text-amber-900 dark:text-amber-100";
  if (status === "INDICATIVE") return "border-cyan-500/45 bg-cyan-500/18 text-cyan-900 dark:text-cyan-100";
  if (status === "FALLBACK") return "border-blue-500/45 bg-blue-500/18 text-blue-900 dark:text-blue-100";
  return "border-red-500/45 bg-red-500/18 text-red-900 dark:text-red-100";
}

function metricUnitChip(unit?: string, fallback = "unit"): string {
  if (!unit) return fallback;
  return unit;
}

function territoryChipLabel(widget?: GrainTerritoryMeta): string {
  if (!widget?.territory?.code) return "Global";
  const code = widget.territory.code.toUpperCase();
  if (code === "GLOBAL") return "Global";
  if (code === "EU") return "EU";
  if (code === "BLACK_SEA") return "Black Sea";
  return code;
}

function territorySortRank(code?: string): number {
  const normalized = String(code || "GLOBAL").toUpperCase();
  const order = ["UA", "BLACK_SEA", "EU", "US", "BR", "AR", "GLOBAL"];
  const idx = order.indexOf(normalized);
  return idx >= 0 ? idx : order.length + 1;
}

function sourceSortKey(widget: GrainTerritoryMeta & { sourceName?: string }): string {
  return String(widget.sourceName || "").toLowerCase();
}

function sortRowsForView(rows: GrainWidgetRow[], mode: "territory" | "source"): GrainWidgetRow[] {
  return [...rows].sort((a, b) => {
    if (mode === "territory") {
      const territoryCmp = territorySortRank(a.territory?.code) - territorySortRank(b.territory?.code);
      if (territoryCmp !== 0) return territoryCmp;
      return String(a.sourceName || "").localeCompare(String(b.sourceName || ""));
    }
    const sourceCmp = String(a.sourceName || "").localeCompare(String(b.sourceName || ""));
    if (sourceCmp !== 0) return sourceCmp;
    return territorySortRank(a.territory?.code) - territorySortRank(b.territory?.code);
  });
}

type NasdaqCadence = "daily" | "weekly" | "monthly" | "unknown";

const NASDAQ_GROUP_DEFS = [
  {
    id: "rates",
    title: "Rates",
    codes: ["DFF", "DGS2", "DGS10", "T10Y2Y"],
  },
  {
    id: "usd",
    title: "USD",
    codes: ["DTWEXBGS"],
  },
  {
    id: "energy-inflation",
    title: "Energy & Inflation",
    codes: ["DCOILWTICO", "DHHNGSP", "CPIAUCSL", "PPIACO"],
  },
] as const;

const NASDAQ_LABEL_MAP: Record<string, string> = {
  DFF: "Fed Funds Rate",
  DGS2: "US 2Y Treasury Yield",
  DGS10: "US 10Y Treasury Yield",
  T10Y2Y: "10Y-2Y Spread",
  DTWEXBGS: "USD Broad Index",
  DCOILWTICO: "WTI Crude",
  DHHNGSP: "Henry Hub Gas",
  CPIAUCSL: "CPI (Urban)",
  PPIACO: "PPI (Commodities)",
};

const NASDAQ_UNIT_FALLBACK_MAP: Record<string, string> = {
  DFF: "%",
  DGS2: "%",
  DGS10: "%",
  T10Y2Y: "pp",
  DTWEXBGS: "index",
  DCOILWTICO: "USD",
  DHHNGSP: "USD",
  CPIAUCSL: "index",
  PPIACO: "index",
};

function nasdaqSeriesPoints(item: GrainWidgetNasdaqDataLinkSnapshot["items"][number]): Array<{ ts: string; value: number }> {
  return (item.series || []).filter((point) => typeof point.value === "number" && Number.isFinite(point.value) && Number.isFinite(Date.parse(point.ts)));
}

function nasdaqDatasetCode(dataset: string): string {
  const normalized = String(dataset || "").trim().toUpperCase();
  const parts = normalized.split("/");
  return (parts[parts.length - 1] || normalized).trim();
}

function normalizeNasdaqUnit(unit?: string): string | undefined {
  if (!unit) return undefined;
  const raw = String(unit).trim();
  if (!raw || raw.toLowerCase() === "value") return undefined;
  if (raw.toLowerCase() === "pct" || raw.toLowerCase() === "percent") return "%";
  return raw;
}

function inferNasdaqCadenceFromSeries(series?: Array<{ ts: string; value: number }>): NasdaqCadence {
  const points = (series || [])
    .map((point) => ({ ts: Date.parse(point.ts), value: point.value }))
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.value))
    .sort((a, b) => a.ts - b.ts);
  if (points.length < 3) return "unknown";

  const diffsDays: number[] = [];
  for (let idx = 1; idx < points.length; idx += 1) {
    const diff = Math.round((points[idx].ts - points[idx - 1].ts) / 86_400_000);
    if (diff > 0) diffsDays.push(diff);
  }
  if (!diffsDays.length) return "unknown";
  const sorted = [...diffsDays].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 2) return "daily";
  if (median <= 10) return "weekly";
  if (median <= 40) return "monthly";
  return "unknown";
}

function resolveNasdaqCadence(item: GrainWidgetNasdaqDataLinkSnapshot["items"][number]): NasdaqCadence {
  const fromPayload = String(item.cadence || item.frequency || "").toLowerCase();
  if (fromPayload.includes("day")) return "daily";
  if (fromPayload.includes("week")) return "weekly";
  if (fromPayload.includes("month")) return "monthly";
  return inferNasdaqCadenceFromSeries(item.series);
}

function resolveNasdaqUnitLabel(item: GrainWidgetNasdaqDataLinkSnapshot["items"][number]): { unit: string; unknown: boolean } {
  const payloadUnit = normalizeNasdaqUnit(item.nativeUnit);
  if (payloadUnit) return { unit: payloadUnit, unknown: false };
  const code = nasdaqDatasetCode(item.dataset);
  const mapped = NASDAQ_UNIT_FALLBACK_MAP[code];
  if (mapped) return { unit: mapped, unknown: false };
  return { unit: "unit unknown", unknown: true };
}

function resolveNasdaqLabel(item: GrainWidgetNasdaqDataLinkSnapshot["items"][number]): string {
  const code = nasdaqDatasetCode(item.dataset);
  return NASDAQ_LABEL_MAP[code] || item.label || code;
}

function trendDirection(change?: number, changePct?: number): "up" | "down" | "flat" {
  const base = typeof changePct === "number" ? changePct : change;
  if (typeof base !== "number" || Number.isNaN(base) || base === 0) return "flat";
  return base > 0 ? "up" : "down";
}

function trendIntensity(change?: number, changePct?: number): number | undefined {
  const base = typeof changePct === "number" ? changePct : change;
  if (typeof base !== "number" || Number.isNaN(base)) return undefined;
  return Math.min(100, Math.max(12, Math.round(Math.abs(base) * 12)));
}

function isTrustworthySeriesSource(args: { status?: string; sourceName?: string; fallbackReason?: string }): boolean {
  const status = String(args.status || "").toUpperCase();
  if (status === "OFFLINE" || status === "FALLBACK") return false;
  const source = String(args.sourceName || "").toLowerCase();
  const reason = String(args.fallbackReason || "").toLowerCase();
  if (source.includes("demo sample") || source.includes("mock")) return false;
  if (reason.includes("mock") || reason.includes("coverage_empty")) return false;
  return true;
}

function isValidEmbedUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return false;
    if (parsed.href.toLowerCase().includes("404")) return false;
    return true;
  } catch {
    return false;
  }
}

function DynamicMiniTrend({
  series,
  change,
  changePct,
  status,
  preferMarkerForFallback = true,
  section,
  cardKind,
  compact = true,
  forcedMode,
  trustedSeries,
  minPoints,
  sourceName,
  providerId,
  staleAgeSec,
  cacheTtlSec,
  debugEnabled = false,
}: {
  series?: Array<{ ts?: string; label?: string; value: number }>;
  change?: number;
  changePct?: number;
  status?: string;
  preferMarkerForFallback?: boolean;
  section: MonitorSectionLayer;
  cardKind: MonitorCardKind;
  compact?: boolean;
  forcedMode?: "sparkline" | "trend_marker" | "neutral";
  trustedSeries?: boolean;
  minPoints?: number;
  sourceName?: string;
  providerId?: string;
  staleAgeSec?: number;
  cacheTtlSec?: number;
  debugEnabled?: boolean;
}) {
  const decision = forcedMode ? { mode: forcedMode, reason: "forced" as const } : getMiniTrendRenderMode({
    series,
    change,
    changePct,
    status,
    section,
    cardKind,
    sourceName,
    providerId,
    staleAgeSec,
    cacheTtlSec,
    preferMarkerForFallback,
    policy: getSectionTrendPolicy(section),
    trustedSeries,
    minPoints,
  });
  const slotClass = getTrendSlotClass({
    section,
    kind: cardKind,
    mode: decision.mode,
    compact,
  });
  const sparklineTone =
    section === "core" || section === "expansion"
      ? "h-full w-full text-foreground/88 dark:text-slate-100/88"
      : "h-full w-full text-foreground/68 dark:text-slate-300/70";
  const markerTone =
    section === "core" || section === "expansion"
      ? "h-full w-full opacity-80"
      : "h-full w-full opacity-65";
  const neutralTone =
    section === "core" || section === "expansion"
      ? "h-full w-full opacity-50"
      : "h-full w-full opacity-38";

  if (decision.mode === "sparkline") {
    return (
      <div
        className={slotClass}
        title={debugEnabled ? `trendMode=${decision.mode}; reason=${decision.reason}` : undefined}
        data-trend-mode={debugEnabled ? decision.mode : undefined}
      >
        <MiniSparklineSvg points={(series || []).map((p) => ({ value: p.value }))} className={sparklineTone} />
      </div>
    );
  }
  if (decision.mode === "trend_marker") {
    return (
      <div
        className={slotClass}
        title={debugEnabled ? `trendMode=${decision.mode}; reason=${decision.reason}` : undefined}
        data-trend-mode={debugEnabled ? decision.mode : undefined}
      >
        <MiniTrendMarker change={change} changePct={changePct} className={markerTone} />
      </div>
    );
  }
  return (
    <div
      className={slotClass}
      title={debugEnabled ? `trendMode=${decision.mode}; reason=${decision.reason}` : undefined}
      data-trend-mode={debugEnabled ? decision.mode : undefined}
    >
      <MiniTrendMarker className={neutralTone} />
    </div>
  );
}

function formatPrimaryPrice(widget: GrainInstrumentWidget, mode: PriceDisplayMode) {
  if (mode === "NATIVE") {
    return {
      value: widget.nativeValueCurrent ?? widget.valueCurrent,
      change: widget.nativeValueChange ?? widget.valueChange,
      changePct: widget.nativeValueChangePct ?? widget.valueChangePct,
      unit: widget.nativeUnit || widget.unit,
      currency: widget.nativeCurrency || widget.currency,
      secondary:
        widget.normalizationStatus === "OK" && widget.normalizedValueCurrent != null
          ? `${widget.normalizedValueCurrent.toFixed(2)} USD/t`
          : undefined,
    };
  }

  if (widget.normalizationStatus === "OK" && widget.normalizedValueCurrent != null) {
    return {
      value: widget.normalizedValueCurrent,
      change: widget.normalizedValueChange,
      changePct: widget.normalizedValueChangePct,
      unit: "t",
      currency: "USD",
      secondary:
        widget.nativeValueCurrent != null
          ? `${widget.nativeValueCurrent.toFixed(2)} ${widget.nativeUnit || "native unit"}`.trim()
          : undefined,
    };
  }

  return {
    value: widget.nativeValueCurrent ?? widget.valueCurrent,
    change: widget.nativeValueChange ?? widget.valueChange,
    changePct: widget.nativeValueChangePct ?? widget.valueChangePct,
    unit: widget.nativeUnit || widget.unit,
    currency: widget.nativeCurrency || widget.currency,
    secondary: widget.normalizationStatus === "FX_MISSING" ? "USD/t unavailable (FX missing)" : "Native units",
  };
}

function GrainInstrumentCard({ widget, priceDisplayMode, debugEnabled = false }: { widget: GrainInstrumentWidget; priceDisplayMode: PriceDisplayMode; debugEnabled?: boolean }) {
  const display = formatPrimaryPrice(widget, priceDisplayMode);
  const positive = (display.change ?? 0) >= 0;
  const trendDecision = getMiniTrendRenderMode({
    series: widget.series,
    change: display.change,
    changePct: display.changePct,
    status: widget.status,
    section: "core",
    cardKind: "instrument",
    sourceName: widget.sourceName,
    policy: getSectionTrendPolicy("core"),
    trustedSeries: isTrustworthySeriesSource({
      status: widget.status,
      sourceName: widget.sourceName,
      fallbackReason: widget.fallbackReason,
    }),
  });
  const cardVariant: CardSizeVariant = resolveCardSizeVariant({
    section: "core",
    kind: "instrument",
    status: widget.status,
    hasPrimaryValue: typeof display.value === "number",
    hasTrend: trendDecision.mode === "sparkline",
  });
  const unitLabel = metricUnitChip(
    display.unit
      ? display.unit.includes("/") || display.unit.toLowerCase().includes("usd") || display.unit.toLowerCase().includes("eur")
        ? display.unit
        : `${display.currency || ""}/${display.unit}`
      : display.currency || "",
  );
  const showTrend = !(trendDecision.mode === "neutral" && display.change == null && display.changePct == null);
  return (
    <Card className="h-full min-h-[168px] border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
      <CardContent className={`${getCardSizeClass(cardVariant)} pt-2 pb-2`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-foreground/65">{widget.venue}</p>
            <p className="text-sm font-semibold text-foreground">{widget.title}{widget.subtitle ? ` · ${widget.subtitle}` : ""}</p>
          </div>
          <div className="flex items-center gap-1">
            <MetricChip label="PRICE" variant="type" tone="muted" />
            <MetricChip label={unitLabel} variant="unit" tone="neutral" />
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold text-foreground">
            {formatNumber(display.value)}
            <span className="ml-1 text-[10px] font-medium text-foreground/65">{unitLabel}</span>
          </p>
          <p className={`text-xs font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>
            {display.change == null ? "No delta" : formatChangeWithUnit({ change: display.change, unit: unitLabel, pct: display.changePct })}
          </p>
        </div>
        <IntensityBar
          compact
          value={trendIntensity(display.change, display.changePct)}
          direction={trendDirection(display.change, display.changePct)}
        />
        {display.secondary ? <p className="text-[10px] text-foreground/65">{display.secondary}</p> : null}

        {showTrend ? (
          <DynamicMiniTrend
            series={widget.series}
            change={display.change}
            changePct={display.changePct}
            status={widget.status}
            section="core"
            cardKind="instrument"
            trustedSeries={isTrustworthySeriesSource({
              status: widget.status,
              sourceName: widget.sourceName,
              fallbackReason: widget.fallbackReason,
            })}
            sourceName={widget.sourceName}
            debugEnabled={debugEnabled}
            forcedMode={trendDecision.mode}
          />
        ) : null}

        <StatusSourceStrip
          compact
          status={widget.status}
          statusClassName={grainStatusClass(widget.status)}
          sourceName={widget.sourceName}
          sourceUrl={widget.sourceUrl}
          updatedLabel={widget.updatedAt ? formatRelative(widget.updatedAt) : widget.timeframe}
          fallbackReason={widget.fallbackReason}
        />
      </CardContent>
    </Card>
  );
}

function GrainComparisonCard({ widget }: { widget: GrainComparisonWidget }) {
  const spreadPositive = (widget.spreadAbs ?? 0) >= 0;
  const variant = resolveCardSizeVariant({
    section: "core",
    kind: "comparison",
    status: widget.status,
    hasPrimaryValue: widget.leftChangePct != null || widget.rightChangePct != null || widget.spreadAbs != null,
    hasTrend: false,
  });
  const relDiff =
    typeof widget.leftChangePct === "number" && typeof widget.rightChangePct === "number"
      ? widget.leftChangePct - widget.rightChangePct
      : undefined;
  return (
    <Card className="h-full min-h-[164px] border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
      <CardContent className={`${getCardSizeClass(variant)} pt-2.5 pb-2`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">{widget.title}</p>
          <div className="flex items-center gap-1">
            <MetricChip label={widget.comparisonType === "proxy" ? "PROXY" : "SPREAD"} variant="type" tone="muted" />
            <Badge className={`text-[10px] ${grainStatusClass(widget.status)}`}>{widget.status}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-foreground/82">
          <div className="rounded-md border border-black/70 dark:border-white/70 bg-muted/55 p-2">
            <p className="text-[10px] text-foreground/65">{widget.leftLabel}</p>
            <p className="mt-0.5 font-semibold text-foreground">{widget.leftChangePct == null ? "n/a" : `${widget.leftChangePct >= 0 ? "+" : ""}${widget.leftChangePct.toFixed(2)}%`}</p>
          </div>
          <div className="rounded-md border border-black/70 dark:border-white/70 bg-muted/55 p-2">
            <p className="text-[10px] text-foreground/65">{widget.rightLabel}</p>
            <p className="mt-0.5 font-semibold text-foreground">{widget.rightChangePct == null ? "n/a" : `${widget.rightChangePct >= 0 ? "+" : ""}${widget.rightChangePct.toFixed(2)}%`}</p>
          </div>
        </div>
        <p className="text-xs font-semibold text-primary">{widget.relativeMoveSignal}</p>
        {widget.spreadAbs != null ? (
          <p className={`text-[11px] font-semibold ${spreadPositive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
            Spread: {spreadPositive ? "+" : ""}{widget.spreadAbs.toFixed(2)} {widget.spreadUnit || "rel"} {widget.spreadPct != null ? `(${spreadPositive ? "+" : ""}${widget.spreadPct.toFixed(2)}%)` : ""}
          </p>
        ) : null}
        <IntensityBar
          compact
          value={trendIntensity(relDiff)}
          direction={trendDirection(relDiff)}
        />
        <p className="text-[10px] text-foreground/65 line-clamp-2">{widget.note || (widget.comparisonType === "proxy" ? "Proxy cross-market comparison (not identical contracts)" : "Relative performance comparison.")}</p>
        <StatusSourceStrip
          compact
          status={widget.status}
          statusClassName={grainStatusClass(widget.status)}
          sourceName={widget.sourceAttribution || "Derived comparison"}
          updatedLabel={widget.updatedAt ? formatRelative(widget.updatedAt) : "n/a"}
          fallbackReason={widget.fallbackReason}
        />
      </CardContent>
    </Card>
  );
}

function formatWidgetRowPrice(row: GrainWidgetRow, mode: PriceDisplayMode) {
  const price = row.price;
  if (!price) {
    return {
      value: undefined,
      change: undefined,
      changePct: undefined,
      unit: undefined,
      currency: undefined,
      secondary: "No price",
    };
  }

  if (mode === "NATIVE") {
    return {
      value: price.nativeValueCurrent ?? price.normalizedValueCurrent,
      change: price.nativeValueChange ?? price.normalizedValueChange,
      changePct: price.nativeValueChangePct ?? price.normalizedValueChangePct,
      unit: price.nativeUnit,
      currency: price.nativeCurrency,
      secondary:
        price.normalizationStatus === "OK" && price.normalizedValueCurrent != null
          ? `${price.normalizedValueCurrent.toFixed(2)} USD/t`
          : undefined,
    };
  }
  if (price.normalizationStatus === "OK" && price.normalizedValueCurrent != null) {
    return {
      value: price.normalizedValueCurrent,
      change: price.normalizedValueChange,
      changePct: price.normalizedValueChangePct,
      unit: "t",
      currency: "USD",
      secondary:
        price.nativeValueCurrent != null
          ? `${price.nativeValueCurrent.toFixed(2)} ${price.nativeUnit || "native unit"}`.trim()
          : undefined,
    };
  }
  return {
    value: price.nativeValueCurrent ?? price.normalizedValueCurrent,
    change: price.nativeValueChange ?? price.normalizedValueChange,
    changePct: price.nativeValueChangePct ?? price.normalizedValueChangePct,
    unit: price.nativeUnit,
    currency: price.nativeCurrency,
    secondary: price.normalizationStatus === "FX_MISSING" ? "USD/t unavailable (FX missing)" : "Native units",
  };
}

function IndicatorCard({ indicator }: { indicator: LogisticsIndicator }) {
  const isPositive = (indicator.valueChange ?? 0) >= 0;
  const trendDecision = getMiniTrendRenderMode({
    series: indicator.series,
    change: indicator.valueChange,
    changePct: indicator.valueChangePct,
    status: indicator.status,
    section: "context",
    cardKind: "index",
    sourceName: indicator.sourceName,
    policy: getSectionTrendPolicy("context"),
  });
  const icon =
    indicator.type === "bdi" ? <Waves className="h-3.5 w-3.5 text-foreground dark:text-primary-foreground" /> :
      indicator.type === "rail_tariff" ? <TrainFront className="h-3.5 w-3.5 text-foreground dark:text-primary-foreground" /> :
        <Activity className="h-3.5 w-3.5 text-foreground dark:text-primary-foreground" />;

  return (
    <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-primary/35 bg-primary/12 p-1.5">{icon}</span>
            <div>
              <CardTitle className="text-sm leading-5">{indicator.title}</CardTitle>
              <CardDescription className="text-[11px] text-foreground/70">{indicator.subtitle}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <MetricChip label={indicator.type === "logistics_pressure" ? "SIGNAL" : "INDEX"} variant="type" tone="muted" />
            <MetricChip label={metricUnitChip(indicator.unit)} variant="unit" tone="neutral" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold text-foreground">
            {indicator.valueCurrent == null ? "n/a" : indicator.type === "logistics_pressure" ? Math.round(indicator.valueCurrent) : formatNumber(indicator.valueCurrent)}
            <span className="ml-1 text-xs font-medium text-foreground/65">{indicator.unit}</span>
          </p>
          {indicator.valueChange != null ? (
            <p className={`text-xs font-semibold ${isPositive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              {formatChangeWithUnit({ change: indicator.valueChange, unit: indicator.unit, pct: indicator.valueChangePct })}
            </p>
          ) : (
            <p className="text-xs text-foreground/60">No delta</p>
          )}
        </div>
        <IntensityBar
          compact
          value={trendIntensity(indicator.valueChange, indicator.valueChangePct)}
          direction={trendDirection(indicator.valueChange, indicator.valueChangePct)}
        />

        <DynamicMiniTrend
          series={indicator.series}
          change={indicator.valueChange}
          changePct={indicator.valueChangePct}
          status={indicator.status}
          section="context"
          cardKind="index"
          sourceName={indicator.sourceName}
          compact={false}
          forcedMode={trendDecision.mode}
        />

        <StatusSourceStrip
          compact
          status={indicatorStatusLabel(indicator.status)}
          statusClassName={indicatorStatusClass(indicator.status)}
          sourceName={indicator.sourceName}
          sourceUrl={indicator.sourceUrl}
          updatedLabel={indicator.updatedAt ? formatRelative(indicator.updatedAt) : indicator.timeframe}
          fallbackReason={indicator.fallbackReason}
        />
        <div className="flex items-center gap-2">
          {indicator.level ? (
            <Badge className="border-primary/35 bg-primary/12 text-[10px] text-foreground dark:text-primary-foreground">{indicator.level}</Badge>
          ) : null}
          <span className="text-[10px] text-foreground/70">{indicator.trendLabel}</span>
        </div>
        {indicator.components ? (
          <div className="flex flex-wrap gap-1">
            <span className="rounded-full border border-black/60 dark:border-white/45 bg-muted/60 px-1.5 py-0.5 text-[9px] text-foreground/78">Black Sea {indicator.components.blackSeaFocus}</span>
            <span className="rounded-full border border-black/60 dark:border-white/45 bg-muted/60 px-1.5 py-0.5 text-[9px] text-foreground/78">Friction {indicator.components.frictionFactors}</span>
            <span className="rounded-full border border-black/60 dark:border-white/45 bg-muted/60 px-1.5 py-0.5 text-[9px] text-foreground/78">Confidence {indicator.components.confidence}</span>
          </div>
        ) : null}
        {indicator.explanation ? <p className="text-[10px] text-foreground/80 line-clamp-2">{indicator.explanation}</p> : null}
        <p className="text-[10px] text-foreground/65 line-clamp-2">{indicator.notes?.[0] || indicator.sourceAttribution}</p>
      </CardContent>
    </Card>
  );
}

function SignalCard({ item, rank }: { item: MonitorItem; rank?: number }) {
  const signalType = classifySignalType(item);
  const impact = classifyImpact(item);
  const isPriority = typeof rank === "number" && rank < 3;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={`group block rounded-xl border p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(154,163,58,0.18)] ${
        isPriority
          ? "border-black/85 dark:border-white/85 bg-gradient-to-br from-primary/14 via-card to-muted/45 shadow-[0_0_0_1px_rgba(154,163,58,0.22)] hover:border-primary/70"
          : "border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 hover:border-primary/55"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge className={`text-[10px] uppercase tracking-wide ${isPriority ? "border-primary/55 bg-primary/20 text-foreground dark:text-primary-foreground" : "border-primary/45 bg-primary/15 text-foreground dark:text-primary-foreground"}`}>
          {signalType}
        </Badge>
        <ImpactBadge impact={impact} />
      </div>
      {isPriority ? (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">Priority Signal #{rank! + 1}</p>
      ) : null}
      <p className="text-sm font-semibold leading-6 text-foreground">{item.title}</p>
      <p className="mt-1 text-xs leading-5 text-foreground/82 line-clamp-2">{whyItMatters(item, signalType)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.crop_tags.slice(0, 2).map((tag) => (
          <SignalTag key={`crop-${item.id}-${tag}`} value={tag} kind="crop" />
        ))}
        {item.topic_tags.slice(0, 2).map((tag) => (
          <SignalTag key={`topic-${item.id}-${tag}`} value={tag} kind="topic" />
        ))}
        {item.region_tags.slice(0, 1).map((tag) => (
          <SignalTag key={`region-${item.id}-${tag}`} value={tag} kind="region" />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-foreground/68">
        <span className="truncate">{item.source_name}</span>
        <span>{formatRelative(item.published_at)}</span>
      </div>
    </a>
  );
}

function CompactWidgetCard({ widget }: { widget: CompactSignalWidget }) {
  const statusClass =
    widget.status === "Rising"
      ? "border-red-600/45 bg-red-500/15 text-red-900 dark:text-red-100"
      : widget.status === "Elevated"
        ? "border-amber-600/45 bg-amber-500/15 text-amber-900 dark:text-amber-100"
        : widget.status === "Cooling"
          ? "border-emerald-600/45 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100"
          : "border-blue-600/45 bg-blue-500/15 text-blue-900 dark:text-blue-100";

  return (
    <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg">
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{widget.title}</CardTitle>
          <Badge className={`text-[10px] uppercase tracking-wide ${statusClass}`}>{widget.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        <div className="flex items-end justify-between gap-2">
          <p className="text-xl font-bold text-foreground">{widget.primary}</p>
          <div className="flex items-center gap-1">
            <MetricChip label="SIGNAL" variant="type" tone="muted" />
            <p className="text-xs text-foreground/78">{widget.secondary} (metric)</p>
          </div>
        </div>
        <IntensityBar
          compact
          value={
            widget.status === "Rising"
              ? 82
              : widget.status === "Elevated"
                ? 66
                : widget.status === "Cooling"
                  ? 28
                  : 48
          }
          direction={widget.status === "Cooling" ? "down" : widget.status === "Stable" ? "flat" : "up"}
        />
        <DynamicMiniTrend
          series={widget.series}
          status={widget.status}
          section="context"
          cardKind="signal"
        />
        <p className="text-[10px] text-foreground/68">{widget.note}</p>
        <StatusSourceStrip
          compact
          status={widget.status}
          statusClassName={statusClass}
          sourceName="Cropto signal pipeline"
          updatedLabel="24h"
        />
      </CardContent>
    </Card>
  );
}

function GrainDataRow({ row, priceDisplayMode, debugEnabled = false }: { row: GrainWidgetRow; priceDisplayMode: PriceDisplayMode; debugEnabled?: boolean }) {
  const display = formatWidgetRowPrice(row, priceDisplayMode);
  const positive = (display.change ?? 0) >= 0;
  const trendDecision = getMiniTrendRenderMode({
    series: row.price?.series || [],
    change: display.change,
    changePct: display.changePct,
    status: row.status,
    section: "expansion",
    cardKind: "row",
    sourceName: row.sourceName,
    policy: getSectionTrendPolicy("expansion"),
    trustedSeries: isTrustworthySeriesSource({
      status: row.status,
      sourceName: row.sourceName,
      fallbackReason: row.notes?.find((note) => note.toLowerCase().includes("coverage")),
    }),
  });
  const rowVariant: CardSizeVariant = resolveCardSizeVariant({
    section: "expansion",
    kind: "row",
    status: row.status,
    hasPrimaryValue: typeof display.value === "number",
    hasTrend: trendDecision.mode === "sparkline",
  });
  const unitLabel = metricUnitChip(
    display.unit
      ? display.unit.includes("/") || display.unit.toLowerCase().includes("usd") || display.unit.toLowerCase().includes("eur")
        ? display.unit
        : `${display.currency || ""}/${display.unit}`
      : display.currency || "",
  );
  const showTrend = !(trendDecision.mode === "neutral" && display.change == null && display.changePct == null);

  return (
    <div className={`rounded-sm border border-black/55 dark:border-white/20 bg-background/45 dark:bg-slate-900/55 p-1.5 h-auto ${getCardSizeClass(rowVariant)}`}>
      <div className="flex items-start justify-between gap-1.5">
        <div>
          <p className="text-[11px] font-semibold text-foreground">{row.label}</p>
          <p className="text-[10px] text-foreground/65">{row.sublabel || row.region || "—"}</p>
        </div>
        <div className="flex items-center gap-1">
          <MetricChip label="PRICE" variant="type" tone="muted" />
          <MetricChip label={territoryChipLabel({ territory: row.territory })} variant="unit" tone="neutral" />
          <Badge className={`text-[10px] ${grainStatusClass(row.status || "OFFLINE")}`}>{row.status || "OFFLINE"}</Badge>
        </div>
      </div>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatNumber(display.value)}
          <span className="ml-1 text-[10px] text-foreground/65">{unitLabel}</span>
        </p>
        <p className={`text-[10px] font-semibold tabular-nums ${positive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
          {display.change == null ? "n/a" : formatChangeWithUnit({ change: display.change, unit: unitLabel, pct: display.changePct })}
        </p>
      </div>
      <IntensityBar
        compact
        className="mt-0.5"
        value={trendIntensity(display.change, display.changePct)}
        direction={trendDirection(display.change, display.changePct)}
      />
      {showTrend ? (
        <DynamicMiniTrend
          series={row.price?.series || []}
          change={display.change}
          changePct={display.changePct}
          status={row.status}
          section="expansion"
          cardKind="row"
          trustedSeries={isTrustworthySeriesSource({
            status: row.status,
            sourceName: row.sourceName,
            fallbackReason: row.notes?.find((note) => note.toLowerCase().includes("coverage")),
          })}
          sourceName={row.sourceName}
          debugEnabled={debugEnabled}
          forcedMode={trendDecision.mode}
        />
      ) : null}
      {display.secondary ? <p className="mt-0.5 text-[10px] text-foreground/68">{display.secondary}</p> : null}
      <div className="mt-0.5">
        <StatusSourceStrip
          compact
          status={row.status || "OFFLINE"}
          statusClassName={grainStatusClass(row.status || "OFFLINE")}
          sourceName={row.sourceName}
          updatedLabel={row.updatedAt ? formatRelative(row.updatedAt) : undefined}
        />
      </div>
    </div>
  );
}

function GrainExpansionFallbackCard({
  title,
  subtitle,
  status = "OFFLINE",
  reason,
}: {
  title: string;
  subtitle: string;
  status?: GrainWidgetStatus;
  reason?: string;
}) {
  const variant = resolveCardSizeVariant({
    section: "expansion",
    kind: "fallback",
    status,
    hasPrimaryValue: false,
    hasTrend: false,
  });
  return (
    <Card className="h-auto self-start border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground shadow-md">
      <CardHeader className="pb-0.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-1">
            <MetricChip label="fallback" variant="type" tone="muted" />
            <Badge className={`text-[10px] ${grainStatusClass(status)}`}>{status}</Badge>
          </div>
        </div>
        <CardDescription className="text-foreground/70">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className={`${getCardSizeClass(variant)} pt-1 text-xs text-foreground/72`}>
        <p className="line-clamp-2">{reason || "Data temporarily unavailable. Source fallback is active."}</p>
        <StatusSourceStrip
          compact
          status={status}
          statusClassName={grainStatusClass(status)}
          sourceName="Fallback data path"
          updatedLabel="n/a"
          fallbackReason={reason}
        />
      </CardContent>
    </Card>
  );
}

function TerritorySelector({
  widget,
  value,
  onChange,
}: {
  widget?: GrainTerritoryMeta;
  value: string;
  onChange: (next: string) => void;
}) {
  if (widget?.territoryScope !== "COUNTRY_MULTI") return null;
  const options = widget.supportedTerritories || [];
  if (options.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 rounded-md border border-black/60 bg-background/80 px-2 text-[10px] uppercase tracking-wide text-foreground dark:border-white/30"
      aria-label="Select territory"
    >
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function MonitorPage() {
  const [commandProfile, setCommandProfile] = useState<CommandProfile>("all");
  const [crop, setCrop] = useState("all");
  const [topic, setTopic] = useState("all");
  const [region, setRegion] = useState("all");
  const [time, setTime] = useState<"24h" | "7d">("24h");
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState(3);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [chartWindow, setChartWindow] = useState<"24h" | "7d">("24h");
  const [priceDisplayMode, setPriceDisplayMode] = useState<PriceDisplayMode>("USD_TON");
  const [temperatureDisplayMode, setTemperatureDisplayMode] = useState<TemperatureDisplayMode>("C");
  const [grainExpansionCollapsed, setGrainExpansionCollapsed] = useState(false);
  const [grainGroupBy, setGrainGroupBy] = useState<"territory" | "source">(() => {
    if (typeof window === "undefined") return "territory";
    const saved = window.localStorage.getItem("monitor_grain_group_by");
    return saved === "source" ? "source" : "territory";
  });
  const [grainCountry, setGrainCountry] = useState<string>(() => {
    if (typeof window === "undefined") return "US";
    return window.localStorage.getItem("monitor_country_global") || "US";
  });
  const [grainPriceType, setGrainPriceType] = useState<"RETAIL" | "WHOLESALE">(() => {
    if (typeof window === "undefined") return "WHOLESALE";
    const saved = window.localStorage.getItem("monitor_price_type_fpma");
    return saved === "RETAIL" ? "RETAIL" : "WHOLESALE";
  });
  const [hiddenSectionIds, setHiddenSectionIds] = useState<SectionId[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(SECTION_STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? (saved.filter((value): value is SectionId => value in SECTION_LABELS)) : [];
    } catch {
      return [];
    }
  });
  const showLiveVisualsHero = import.meta.env.VITE_MONITOR_SHOW_LIVE_VISUALS_HERO === "true";
  const allowMacroEmbedFrames = import.meta.env.VITE_MONITOR_ENABLE_MACRO_EMBEDS === "true";

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("monitor_grain_group_by", grainGroupBy);
  }, [grainGroupBy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("monitor_country_global", grainCountry);
  }, [grainCountry]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("monitor_price_type_fpma", grainPriceType);
  }, [grainPriceType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(hiddenSectionIds));
  }, [hiddenSectionIds]);

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);

  const monitorQuery = useQuery<MonitorResponse>({
    queryKey: ["monitor-news", crop, topic, region, time, search, threshold],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("crop", crop);
      params.set("topic", topic);
      params.set("region", region);
      params.set("time", time);
      params.set("threshold", String(threshold));
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/monitor/news?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load monitor feed");
      return response.json();
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const indicesQuery = useQuery<IndicesResponse>({
    queryKey: ["monitor-indices"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/indices");
      if (!response.ok) throw new Error("Failed to load indices");
      return response.json();
    },
    refetchInterval: 60 * 1000,
  });

  const fxQuery = useQuery<FxResponse>({
    queryKey: ["monitor-fx"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/macro-fx");
      if (!response.ok) throw new Error("Failed to load macro snapshot");
      return response.json();
    },
    refetchInterval: 10 * 60 * 1000,
  });

  const logisticsIndicatorsQuery = useQuery<LogisticsIndicatorsResponse>({
    queryKey: ["monitor-logistics-indicators"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/logistics-indicators");
      if (!response.ok) throw new Error("Failed to load logistics indicators");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const grainMarketsQuery = useQuery<GrainMarketsResponse>({
    queryKey: ["monitor-grain-markets-core"],
    queryFn: async () => {
      const response = await fetch("/api/monitor/grain-markets");
      if (!response.ok) throw new Error("Failed to load grain markets core");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const grainWidgetsQuery = useQuery<GrainWidgetsResponse>({
    queryKey: ["monitor-grain-widgets", grainCountry, grainPriceType],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("country", grainCountry);
      params.set("priceType", grainPriceType);
      const response = await fetch(`/api/monitor/grain-widgets?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load grain data expansion widgets");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const debugQuery = useQuery<DebugResponse>({
    queryKey: ["monitor-debug"],
    enabled: debugEnabled,
    queryFn: async () => {
      const response = await fetch("/api/monitor/debug");
      if (!response.ok) throw new Error("Failed to load debug stats");
      return response.json();
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const feed = monitorQuery.data?.feed || [];
  const topSignals = monitorQuery.data?.topSignals || [];
  const prioritySignals = topSignals.slice(0, 3);
  const chartFeed = useMemo(() => {
    if (chartWindow === "24h") return feed.filter((item) => inLastHours(item, 24));
    return feed.filter((item) => inLastHours(item, 24 * 7));
  }, [chartWindow, feed]);

  const pulseByCrop = useMemo(() => {
    return HERO_CROPS.map((cropName) => {
      const total = feed.filter((item) => item.crop_tags.includes(cropName)).length;
      const now24h = feed.filter((item) => item.crop_tags.includes(cropName) && inLastHours(item, 24)).length;
      const prev24h = feed.filter((item) => {
        if (!item.crop_tags.includes(cropName)) return false;
        const ts = Date.parse(item.published_at);
        if (!Number.isFinite(ts)) return false;
        const diff = Date.now() - ts;
        return diff > 24 * 60 * 60 * 1000 && diff <= 48 * 60 * 60 * 1000;
      }).length;
      const delta = now24h - prev24h;
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      return { crop: cropName, total, now24h, delta, direction };
    });
  }, [feed]);

  const blackSeaSignals = useMemo(() => {
    return [...feed]
      .filter((item) => {
        const txt = `${item.title} ${item.summary || ""}`.toLowerCase();
        const regionHit =
          item.region_tags.some((tag) =>
            ["black sea", "ukraine", "russia", "romania", "bulgaria", "poland"].some((needle) =>
              tag.includes(needle),
            ),
          ) || ["black sea", "ukraine", "russia", "romania", "bulgaria", "poland"].some((needle) => txt.includes(needle));
        const riskTopic = item.topic_tags.some((tag) => ["logistics", "policy", "weather", "trade"].includes(tag));
        return regionHit && riskTopic;
      })
      .sort((a, b) => b.relevance_score - a.relevance_score || Date.parse(b.published_at) - Date.parse(a.published_at));
  }, [feed]);
  const blackSeaRisks = useMemo(() => blackSeaSignals.slice(0, 4), [blackSeaSignals]);

  const widgetSeriesFor = useMemo(() => {
    const build = (predicate: (item: MonitorItem) => boolean) => {
      const series: Array<{ label: string; value: number }> = [];
      for (let offset = 6; offset >= 0; offset -= 1) {
        const dayDate = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
        const day = dayDate.toISOString().slice(5, 10);
        const start = new Date(dayDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dayDate);
        end.setHours(23, 59, 59, 999);
        const count = feed.filter((item) => {
          const ts = Date.parse(item.published_at);
          return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime() && predicate(item);
        }).length;
        series.push({ label: day, value: count });
      }
      return series;
    };

    return {
      blackSea: build((item) =>
        item.region_tags.some((tag) => ["black sea", "ukraine", "romania", "bulgaria", "poland"].some((needle) => tag.includes(needle))),
      ),
      logistics: build((item) => item.topic_tags.includes("logistics")),
      weather: build((item) => item.topic_tags.includes("weather")),
      policy: build((item) => item.topic_tags.includes("policy") || item.topic_tags.includes("trade")),
    };
  }, [feed]);

  const compactWidgets = useMemo<CompactSignalWidget[]>(() => {
    const blackSea24h = blackSeaSignals.filter((item) => inLastHours(item, 24)).length;
    const blackSea7d = blackSeaSignals.filter((item) => inLastHours(item, 24 * 7)).length;
    const blackSeaStatus: CompactSignalStatus = blackSea24h >= 8 ? "Rising" : blackSea24h >= 4 ? "Elevated" : "Stable";

    const logistics24h = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24)).length;
    const logisticsHigh24h = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24) && classifyImpact(item) === "High").length;
    const logisticsStatus: CompactSignalStatus = logisticsHigh24h >= 3 ? "Elevated" : logistics24h > 6 ? "Rising" : "Stable";

    const weather24h = feed.filter((item) => item.topic_tags.includes("weather") && inLastHours(item, 24)).length;
    const weatherByRegion = ["black sea", "eu", "us", "latam"]
      .map((regionName) => ({ regionName, count: feed.filter((item) => item.topic_tags.includes("weather") && inRegion(item, regionName)).length }))
      .sort((a, b) => b.count - a.count)[0];
    const weatherStatus: CompactSignalStatus = weather24h >= 6 ? "Elevated" : weather24h >= 3 ? "Rising" : "Cooling";

    const policy24h = feed.filter((item) => (item.topic_tags.includes("policy") || item.topic_tags.includes("trade")) && inLastHours(item, 24)).length;
    const policyStatus: CompactSignalStatus = policy24h >= 7 ? "Rising" : policy24h >= 3 ? "Elevated" : "Stable";

    return [
      {
        id: "black-sea-activity",
        title: "Black Sea Activity",
        status: blackSeaStatus,
        primary: `${blackSea24h}`,
        secondary: `7d: ${blackSea7d}`,
        note: "Mentions tagged to Black Sea corridor risk.",
        series: widgetSeriesFor.blackSea,
      },
      {
        id: "logistics-pressure",
        title: "Logistics Pressure",
        status: logisticsStatus,
        primary: `${logisticsHigh24h} high`,
        secondary: `24h logistics: ${logistics24h}`,
        note: "High-impact logistics signals over 24h.",
        series: widgetSeriesFor.logistics,
      },
      {
        id: "weather-risk",
        title: "Weather Risk Pulse",
        status: weatherStatus,
        primary: `${weather24h}`,
        secondary: `Hot region: ${asLabel(weatherByRegion?.regionName || "black sea")}`,
        note: "Weather-tagged signals across active regions.",
        series: widgetSeriesFor.weather,
      },
      {
        id: "policy-pressure",
        title: "Policy / Trade Friction",
        status: policyStatus,
        primary: `${policy24h}`,
        secondary: "24h policy & trade",
        note: "Regulatory and trade-flow pressure monitor.",
        series: widgetSeriesFor.policy,
      },
    ];
  }, [blackSeaSignals, feed, widgetSeriesFor]);

  const marketNarrative = useMemo(() => {
    const logistics24 = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24)).length;
    const policy24 = feed.filter((item) => (item.topic_tags.includes("policy") || item.topic_tags.includes("trade")) && inLastHours(item, 24)).length;
    const weather24 = feed.filter((item) => item.topic_tags.includes("weather") && inLastHours(item, 24)).length;
    const high24 = feed.filter((item) => inLastHours(item, 24) && classifyImpact(item) === "High").length;
    const score = logistics24 * 2 + policy24 * 2 + weather24 + high24 * 3;
    if (score >= 30) {
      return {
        status: "Elevated",
        line: "Risk tone is elevated: logistics and policy signals are driving near-term volatility narratives.",
      };
    }
    if (score >= 18) {
      return {
        status: "Rising",
        line: "Signal flow is building across logistics and weather channels; monitor hedge timing and corridor exposure.",
      };
    }
    return {
      status: "Stable",
      line: "Narrative remains balanced with moderate signal density and no broad stress cluster.",
    };
  }, [feed]);

  const cropVolumeData = useMemo(() => {
    return HERO_CROPS.map((cropName) => ({
      name: asLabel(cropName),
      count: chartFeed.filter((item) => item.crop_tags.includes(cropName)).length,
    }));
  }, [chartFeed]);

  const topicVolumeData = useMemo(() => {
    return TOPICS.filter((v) => v !== "all").map((topicName) => ({
      name: asLabel(topicName),
      count: chartFeed.filter((item) => item.topic_tags.includes(topicName)).length,
    }));
  }, [chartFeed]);

  const regionVolumeData = useMemo(() => {
    return REGIONS.filter((v) => v !== "all").map((regionName) => ({
      name: asLabel(regionName),
      count: chartFeed.filter((item) => inRegion(item, regionName)).length,
    }));
  }, [chartFeed]);

  const mentionsTrendData = useMemo(() => {
    const buckets: Array<{ day: string; count: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayDate = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const day = dayDate.toISOString().slice(5, 10);
      const start = new Date(dayDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dayDate);
      end.setHours(23, 59, 59, 999);
      const count = chartFeed.filter((item) => {
        const ts = Date.parse(item.published_at);
        return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime();
      }).length;
      buckets.push({ day, count });
    }
    return buckets;
  }, [chartFeed]);

  const panelItems = useMemo(() => {
    const markets = feed.filter((item) => item.topic_tags.some((tag) => ["markets", "trade", "harvest"].includes(tag)));
    const logistics = feed.filter((item) => item.topic_tags.includes("logistics"));
    const policy = feed.filter((item) => item.topic_tags.some((tag) => ["policy", "trade"].includes(tag)));
    const weather = feed.filter((item) => item.topic_tags.includes("weather"));
    const blackSea = feed.filter((item) => inRegion(item, "black sea") || inRegion(item, "eu") || inRegion(item, "latam") === false && inRegion(item, "us") === false);
    const oilseedsBiofuels = feed.filter((item) => {
      const txt = `${item.title} ${item.summary || ""}`.toLowerCase();
      return item.crop_tags.some((tag) => ["soy", "rapeseed", "sunflower", "oilseeds"].includes(tag)) || txt.includes("biofuel");
    });

    return {
      markets,
      logistics,
      policy,
      weather,
      blackSea,
      oilseedsBiofuels,
    };
  }, [feed]);

  const panels = [
    { id: "markets", title: "Markets", items: panelItems.markets },
    { id: "logistics", title: "Logistics", items: panelItems.logistics },
    { id: "policy", title: "Policy & Trade", items: panelItems.policy },
    { id: "weather", title: "Weather Watch", items: panelItems.weather },
    { id: "blackSea", title: "Black Sea", items: panelItems.blackSea },
    { id: "oilseedsBiofuels", title: "Oilseeds / Biofuels", items: panelItems.oilseedsBiofuels },
  ] as const;

  const grainDataOrder = useMemo(() => {
    const defaultOrder: GrainWidgetKind[] = [
      "US_CASH_BIDS",
      "GLOBAL_SPOT_TABLE",
      "CROP_PRICE_INDEX",
      "CBOT_FUTURES_SNAPSHOT",
      "LIVESTOCK_FEED_TIEIN",
      "MACRO_AGRI_INDICES",
      "USDA_MARS_REPORTS",
      "US_CASH_EXPORT_CONTEXT",
      "USDA_MARS_DAILY_MARKET_RATES_TXT",
      "ALPHAVANTAGE_GRAIN_BENCHMARKS",
      "NASDAQ_DATA_LINK_SNAPSHOT",
      "USDA_GTR_LOGISTICS_SNAPSHOT",
      "FAOSTAT_PP_MULTI_COUNTRY",
      "FPMA_MARKET_PRICES_MULTI_COUNTRY",
    ];
    const rawOrder = (grainWidgetsQuery.data?.widgets.order || []).filter((kind) =>
      defaultOrder.includes(kind),
    );
    const unique = Array.from(new Set([...rawOrder, ...defaultOrder]));
    return unique as GrainWidgetKind[];
  }, [grainWidgetsQuery.data]);

  const grainDataByKind = useMemo(() => {
    return (grainWidgetsQuery.data?.widgets.byKind || {}) as Partial<Record<GrainWidgetKind, GrainWidget>>;
  }, [grainWidgetsQuery.data]);

  const usdaPsdWidget = grainDataByKind["USDA_PSD_BALANCES"] as GrainWidgetUsdaPsdBalances | undefined;
  const amisWidget = grainDataByKind["AMIS_GLOBAL_BALANCE"] as GrainWidgetAmisGlobalBalance | undefined;
  const imfWidget = grainDataByKind["IMF_COMMODITY_BENCHMARKS"] as GrainWidgetImfCommodityBenchmarks | undefined;
  const oecdWidget = grainDataByKind["OECD_AGRICULTURAL_OUTLOOK"] as GrainWidgetOecdAgriculturalOutlook | undefined;

  const grainExpansionGroups = useMemo(() => {
    const widgets = Object.values(grainDataByKind).filter(Boolean) as GrainWidget[];
    const grouped = new Map<string, GrainWidget[]>();
    for (const widget of widgets) {
      const key =
        grainGroupBy === "territory"
          ? territoryChipLabel(widget)
          : String(widget.sourceName || "Unknown source");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(widget);
    }
    const sortedGroups = Array.from(grouped.entries())
      .map(([key, values]) => ({
        key,
        values: values.sort((a, b) => {
          if (grainGroupBy === "territory") {
            const territoryCmp = territorySortRank(a.territory?.code) - territorySortRank(b.territory?.code);
            if (territoryCmp !== 0) return territoryCmp;
          }
          return sourceSortKey(a).localeCompare(sourceSortKey(b));
        }),
      }))
      .sort((a, b) => {
        if (grainGroupBy === "territory") {
          const rankA = territorySortRank(a.values[0]?.territory?.code);
          const rankB = territorySortRank(b.values[0]?.territory?.code);
          return rankA - rankB;
        }
        return a.key.localeCompare(b.key);
      });
    return sortedGroups;
  }, [grainDataByKind, grainGroupBy]);

  const hiddenSections = useMemo(
    () => hiddenSectionIds.map((id) => ({ id, label: SECTION_LABELS[id] })),
    [hiddenSectionIds],
  );

  const isSectionHidden = (id: SectionId) => hiddenSectionIds.includes(id);

  const toggleSectionHidden = (id: SectionId) => {
    setHiddenSectionIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const heroCounts = useMemo(() => {
    const allSignals24h = feed.filter((item) => inLastHours(item, 24)).length;
    const highImpact24h = feed.filter((item) => inLastHours(item, 24) && classifyImpact(item) === "High").length;
    const logistics24h = feed.filter((item) => item.topic_tags.includes("logistics") && inLastHours(item, 24)).length;
    return { allSignals24h, highImpact24h, logistics24h };
  }, [feed]);

  const heroWatchItems = useMemo(() => {
    const preferred = blackSeaRisks.length ? blackSeaRisks : prioritySignals.length ? prioritySignals : topSignals;
    return preferred.slice(0, 4);
  }, [blackSeaRisks, prioritySignals, topSignals]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MonitorHeader navItems={[...MONITOR_NAV_ITEMS]} />
      <main>
      <section id="overview" className="rounded-none border-b border-black/70 dark:border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(154,163,58,0.12),rgba(246,247,241,0.98)_52%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(154,163,58,0.18),rgba(10,14,26,0.95)_45%)] p-4 text-foreground dark:text-slate-100 shadow-[0_20px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_24px_50px_rgba(0,0,0,0.35)] sm:p-5">
        <div className="space-y-3">
          <div className="rounded-2xl border border-black/60 bg-background/70 p-3 shadow-sm backdrop-blur dark:border-white/15 dark:bg-slate-950/70">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-primary/40 bg-primary/12 text-[10px] uppercase tracking-[0.18em] text-foreground dark:text-primary-foreground">Cropto Monitor</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-[0.16em]">Sprint 1 layout</Badge>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-white sm:text-4xl">Commodity Signals Terminal</h1>
                <p className="max-w-3xl text-sm text-foreground/82 dark:text-slate-300 sm:text-base">
                  Hero-first market monitor for grains, oilseeds, logistics, outlooks, and signal flow. This sprint establishes command controls, section architecture, and hidden-module handling.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]">
                <div className="rounded-xl border border-black/60 bg-card/90 p-2.5 dark:border-white/15">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/62">24h signals</p>
                  <p className="mt-1 text-2xl font-semibold">{heroCounts.allSignals24h}</p>
                  <p className="text-[11px] text-foreground/62">decision-relevant headlines and alerts</p>
                </div>
                <div className="rounded-xl border border-black/60 bg-card/90 p-2.5 dark:border-white/15">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/62">High impact</p>
                  <p className="mt-1 text-2xl font-semibold text-red-600 dark:text-red-300">{heroCounts.highImpact24h}</p>
                  <p className="text-[11px] text-foreground/62">priority signals in current cycle</p>
                </div>
                <div className="rounded-xl border border-black/60 bg-card/90 p-2.5 dark:border-white/15">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/62">Logistics watch</p>
                  <p className="mt-1 text-2xl font-semibold">{heroCounts.logistics24h}</p>
                  <p className="text-[11px] text-foreground/62">freight and corridor mentions</p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="space-y-3 rounded-2xl border border-black/55 bg-card/85 p-3 dark:border-white/15 dark:bg-slate-950/72">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/58">Command Strip</p>
                    <p className="text-sm text-foreground/74">Role and territory controls anchor the page structure now. Role-specific filtering lands in Sprint 2.</p>
                  </div>
                  <div className="text-xs text-foreground/70 dark:text-slate-400">
                    Updated: {monitorQuery.data?.generatedAt ? new Date(monitorQuery.data.generatedAt).toLocaleString() : "loading"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {COMMAND_PROFILES.map((profile) => (
                    <CommandChip
                      key={profile.id}
                      label={profile.label}
                      active={commandProfile === profile.id}
                      onClick={() => setCommandProfile(profile.id)}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full border border-black/60 bg-background/80 px-3 py-2 text-sm dark:border-white/20">
                    <LayoutGrid className="h-4 w-4 text-primary" />
                    <span className="text-foreground/80">Country</span>
                    <select
                      value={grainCountry}
                      onChange={(event) => setGrainCountry(event.target.value)}
                      className="bg-transparent text-sm font-semibold outline-none"
                      aria-label="Primary monitor country"
                    >
                      <option value="US">United States</option>
                      <option value="UA">Ukraine</option>
                      <option value="BR">Brazil</option>
                      <option value="AR">Argentina</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-black/60 bg-background/80 px-3 py-2 text-sm dark:border-white/20">
                    <Filter className="h-4 w-4 text-primary" />
                    <span className="text-foreground/80">Signal range</span>
                    <span className="font-semibold">{chartWindow}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-full border-black/60 px-4 dark:border-white/20"
                    onClick={() => setHiddenSectionIds([])}
                    disabled={!hiddenSectionIds.length}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Show hidden{hiddenSectionIds.length ? ` (${hiddenSectionIds.length})` : ""}
                  </Button>
                </div>

                <div className="grid gap-3 xl:grid-cols-[1.18fr_0.82fr]">
                  <div className="rounded-2xl border border-black/55 bg-background/80 p-3 dark:border-white/15">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/58">Market Pulse Canvas</p>
                        <p className="text-base font-semibold">Cross-market pressure map</p>
                      </div>
                      <MetricChip label={marketNarrative.status} variant="provider" tone={marketNarrative.status === "Elevated" ? "accent" : "neutral"} />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-foreground/72">{marketNarrative.line}</p>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {pulseByCrop.map((entry) => (
                        <div key={`hero-pulse-${entry.crop}`} className="rounded-xl border border-black/55 bg-card/85 p-2.5 dark:border-white/12">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/82">{asLabel(entry.crop)}</p>
                              <MetricChip label="pulse" variant="type" tone="muted" />
                            </div>
                            {entry.direction === "up" ? (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                            ) : entry.direction === "down" ? (
                              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5 text-foreground/55" />
                            )}
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-2xl font-semibold text-foreground">{entry.now24h}</p>
                              <p className="text-[11px] text-foreground/62">signals now</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-foreground">{entry.total}</p>
                              <p className="text-[11px] text-foreground/62">total mentions</p>
                            </div>
                          </div>
                          <IntensityBar
                            compact
                            className="mt-2"
                            value={Math.min(100, Math.max(10, entry.now24h * 8))}
                            direction={entry.direction === "up" ? "up" : entry.direction === "down" ? "down" : "flat"}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-2xl border border-black/55 bg-background/80 p-3 dark:border-white/15">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/58">Hero Narrative</p>
                          <p className="text-base font-semibold">Operating picture</p>
                        </div>
                        <MetricChip label="summary" variant="type" tone="muted" />
                      </div>
                      <div className="mt-2 grid gap-2">
                        {prioritySignals.slice(0, 2).map((item) => (
                          <a key={`hero-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-black/55 bg-card/85 p-2.5 transition hover:border-primary/45 dark:border-white/12">
                            <div className="flex items-start justify-between gap-2">
                              <p className="line-clamp-2 text-sm font-medium text-foreground">{item.title}</p>
                              <ImpactBadge impact={classifyImpact(item)} />
                            </div>
                            <p className="mt-1 text-[11px] text-foreground/64">{classifySignalType(item)} • {item.source_name} • {formatRelative(item.published_at)}</p>
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
                      {compactWidgets.map((widget) => (
                        <CompactWidgetCard key={`hero-compact-${widget.id}`} widget={widget} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {showLiveVisualsHero ? (
                  <LiveVisualsPanel debugEnabled={debugEnabled} compact />
                ) : (
                  <Card className="border-black/65 bg-gradient-to-br from-card to-muted/30 shadow-sm dark:border-white/15">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Tv className="h-4 w-4 text-primary" />
                          <CardTitle className="text-base">Media Rail</CardTitle>
                        </div>
                        <MetricChip label="placeholder" variant="provider" tone="muted" />
                      </div>
                      <CardDescription>Reserved for video streams, market TV, and port logistics cameras.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-dashed border-black/40 bg-background/70 p-3 dark:border-white/15">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/72">Video slot</p>
                        <p className="mt-2 text-sm text-foreground/72">Market TV / commentary embed placeholder.</p>
                      </div>
                      <div className="rounded-xl border border-dashed border-black/40 bg-background/70 p-3 dark:border-white/15">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/72">Camera slot</p>
                        <p className="mt-2 text-sm text-foreground/72">Port / terminal / logistics camera placeholder.</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card className="border-black/65 bg-gradient-to-br from-card to-muted/30 shadow-sm dark:border-white/15">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Tv className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">Signal Watchlist</CardTitle>
                      </div>
                      <MetricChip label={`${heroWatchItems.length} live`} variant="provider" tone="neutral" />
                    </div>
                    <CardDescription>Compact hero watchlist for corridor, logistics, and market stress.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {heroWatchItems.map((item) => (
                      <a key={`watch-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border border-black/55 bg-background/70 p-2 transition hover:border-primary/35 dark:border-white/12">
                        <p className="line-clamp-2 text-xs font-medium">{item.title}</p>
                        <p className="mt-1 text-[10px] text-foreground/62">{asLabel(item.region_tags[0] || item.topic_tags[0] || "market")} • {formatRelative(item.published_at)}</p>
                      </a>
                    ))}
                    {!heroWatchItems.length ? (
                      <div className="rounded-lg border border-dashed border-black/40 bg-background/65 p-3 text-xs text-foreground/68 dark:border-white/12">
                        Hero watchlist will populate from live signals, feeds, and video-linked alerts as more sources are connected.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {!isSectionHidden("grain-markets-core") ? (
          <div id="grain-markets-core" className="scroll-mt-24 space-y-1.5 rounded-lg border border-primary/35 bg-primary/[0.06] p-2.5 shadow-[inset_0_0_0_1px_rgba(154,163,58,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/82 dark:text-slate-300">Grain Markets Core</h2>
                <span className="text-[11px] text-foreground/65 dark:text-slate-500">
                  {grainMarketsQuery.data?.meta?.partialFailure ? "CBOT + Euronext (partial/fallback)" : "CBOT + Euronext (core)"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-foreground/65 dark:text-slate-400">
                <span className="uppercase tracking-wide">Price</span>
                <Button
                  size="sm"
                  variant={priceDisplayMode === "USD_TON" ? "default" : "outline"}
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setPriceDisplayMode("USD_TON")}
                >
                  USD/t
                </Button>
                <Button
                  size="sm"
                  variant={priceDisplayMode === "NATIVE" ? "default" : "outline"}
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setPriceDisplayMode("NATIVE")}
                >
                  Native
                </Button>
                <span className="ml-1 uppercase tracking-wide">Temp</span>
                <Button
                  size="sm"
                  variant={temperatureDisplayMode === "C" ? "default" : "outline"}
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setTemperatureDisplayMode("C")}
                >
                  °C
                </Button>
                <Button
                  size="sm"
                  variant={temperatureDisplayMode === "F" ? "default" : "outline"}
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setTemperatureDisplayMode("F")}
                >
                  °F
                </Button>
                <SectionHideButton onClick={() => toggleSectionHidden("grain-markets-core")} />
              </div>
            </div>
            {!grainMarketsQuery.data || (grainMarketsQuery.data.widgets.cbot.length === 0 && grainMarketsQuery.data.widgets.euronext.length === 0) ? (
              <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground">
                <CardContent className="pt-6 text-sm text-foreground/72">
                  Grain markets core is temporarily unavailable.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2 xl:grid-cols-12">
                <div className="xl:col-span-8 grid auto-rows-[minmax(0,1fr)] gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {[...(grainMarketsQuery.data?.widgets.cbot || []), ...(grainMarketsQuery.data?.widgets.euronext || [])].map((widget) => (
                    <GrainInstrumentCard key={widget.instrumentKey} widget={widget} priceDisplayMode={priceDisplayMode} debugEnabled={debugEnabled} />
                  ))}
                </div>
                <div className="xl:col-span-4 grid auto-rows-[minmax(0,1fr)] gap-2">
                  {(grainMarketsQuery.data?.widgets.comparisons || []).map((widget) => (
                    <GrainComparisonCard key={widget.id} widget={widget} />
                  ))}
                </div>
              </div>
            )}
          </div>
          ) : null}

          {!isSectionHidden("grain-data-expansion") ? (
          <div id="grain-data-expansion" className="scroll-mt-24 space-y-1 rounded-lg border border-black/50 dark:border-white/20 bg-background/30 p-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/82 dark:text-slate-300">Grain Data Expansion</h2>
                <span className="text-[11px] text-foreground/58 dark:text-slate-500">
                  {grainWidgetsQuery.data?.meta.partialFailure ? "Cash / Spot / Index / Futures (partial/fallback)" : "Cash / Spot / Index / Futures"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-foreground/62">Group by</span>
                <Button
                  size="sm"
                  variant={grainGroupBy === "territory" ? "default" : "outline"}
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setGrainGroupBy("territory")}
                >
                  Territory
                </Button>
                <Button
                  size="sm"
                  variant={grainGroupBy === "source" ? "default" : "outline"}
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setGrainGroupBy("source")}
                >
                  Source
                </Button>
                <span className="text-[10px] uppercase tracking-wide text-foreground/62">Country</span>
                <select
                  value={grainCountry}
                  onChange={(event) => setGrainCountry(event.target.value)}
                  className="h-7 rounded-md border border-black/60 bg-background/80 px-2 text-[10px] uppercase tracking-wide text-foreground dark:border-white/30"
                  aria-label="Global country switcher"
                >
                  <option value="US">US</option>
                  <option value="UA">UA</option>
                  <option value="BR">BR</option>
                  <option value="AR">AR</option>
                </select>
                <span className="text-[11px] text-foreground/65 dark:text-slate-500">
                  {grainWidgetsQuery.data?.meta.cacheAgeSec != null ? `cache ${grainWidgetsQuery.data.meta.cacheAgeSec}s` : "loading"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px] border-black/70 dark:border-white/30 text-foreground dark:text-slate-200"
                  onClick={() => setGrainExpansionCollapsed((v) => !v)}
                >
                  {grainExpansionCollapsed ? "Expand" : "Collapse"}
                </Button>
                <SectionHideButton onClick={() => toggleSectionHidden("grain-data-expansion")} />
              </div>
            </div>

            {grainExpansionCollapsed ? null : !grainWidgetsQuery.data ? (
              <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground">
                <CardContent className="pt-6 text-sm text-foreground/72">
                  Grain data expansion widgets are temporarily unavailable.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  {grainExpansionGroups.map((group) => (
                    <MetricChip
                      key={`group-${group.key}`}
                      label={`${group.key} (${group.values.length})`}
                      variant={grainGroupBy === "territory" ? "unit" : "provider"}
                      tone={grainGroupBy === "territory" ? "neutral" : "muted"}
                    />
                  ))}
                </div>
                <div className="grid auto-rows-[minmax(0,1fr)] items-start gap-1.5 xl:grid-cols-12">
                {(() => {
                  const cashWidget = grainDataByKind["US_CASH_BIDS"] as GrainWidgetCashBids | undefined;
                  const spotWidget = grainDataByKind["GLOBAL_SPOT_TABLE"] as GrainWidgetGlobalSpot | undefined;
                  const indexWidget = grainDataByKind["CROP_PRICE_INDEX"] as GrainWidgetCropIndex | undefined;
                  const futuresWidget = grainDataByKind["CBOT_FUTURES_SNAPSHOT"] as GrainWidgetFuturesSnapshot | undefined;
                  const livestockWidget = grainDataByKind["LIVESTOCK_FEED_TIEIN"] as GrainWidgetLivestockFeedTieIn | undefined;
                  const macroWidget = grainDataByKind["MACRO_AGRI_INDICES"] as GrainWidgetMacroAgriIndices | undefined;
                  const marsWidget = grainDataByKind["USDA_MARS_REPORTS"] as GrainWidgetUsdaMarsReports | undefined;
                  const usContextWidget = grainDataByKind["US_CASH_EXPORT_CONTEXT"] as GrainWidgetUsCashExportContext | undefined;
                  const marsDailyTxtWidget = grainDataByKind["USDA_MARS_DAILY_MARKET_RATES_TXT"] as GrainWidgetUsdaMarsDailyMarketRatesTxt | undefined;
                  const alphaWidget = grainDataByKind["ALPHAVANTAGE_GRAIN_BENCHMARKS"] as GrainWidgetAlphaVantageBenchmarks | undefined;
                  const nasdaqWidget = grainDataByKind["NASDAQ_DATA_LINK_SNAPSHOT"] as GrainWidgetNasdaqDataLinkSnapshot | undefined;
                  const ecCerealsWidget = grainDataByKind["EC_CEREALS_MULTI_COUNTRY"] as GrainWidgetEcOfficialPricesMultiCountry | undefined;
                  const ecOilseedsWidget = grainDataByKind["EC_OILSEEDS_MULTI_COUNTRY"] as GrainWidgetEcOfficialPricesMultiCountry | undefined;
                  const usdaNassWidget = grainDataByKind["USDA_NASS_PRODUCER_PRICES"] as GrainWidgetUsdaNassProducerPrices | undefined;
                  const wfpWidget = grainDataByKind["WFP_MARKET_PRICES_MULTI_COUNTRY"] as GrainWidgetCountryMarketPricesMultiCountry | undefined;
                  const worldBankWidget = grainDataByKind["WB_MICRODATA_MARKET_PRICES"] as GrainWidgetCountryMarketPricesMultiCountry | undefined;
                  const eurostatWidget = grainDataByKind["EUROSTAT_AGRI_PRICE_INDICES"] as GrainWidgetEurostatAgriPriceIndices | undefined;
                  const usdaPsdWidget = grainDataByKind["USDA_PSD_BALANCES"] as GrainWidgetUsdaPsdBalances | undefined;
                  const amisWidget = grainDataByKind["AMIS_GLOBAL_BALANCE"] as GrainWidgetAmisGlobalBalance | undefined;
                  const imfWidget = grainDataByKind["IMF_COMMODITY_BENCHMARKS"] as GrainWidgetImfCommodityBenchmarks | undefined;
                  const oecdWidget = grainDataByKind["OECD_AGRICULTURAL_OUTLOOK"] as GrainWidgetOecdAgriculturalOutlook | undefined;
                  const usdaGtrWidget = grainDataByKind["USDA_GTR_LOGISTICS_SNAPSHOT"] as GrainWidgetUsdaGtrLogisticsSnapshot | undefined;
                  const canadaRailWidget = grainDataByKind["CANADA_GRAIN_RAIL_PERFORMANCE"] as GrainWidgetCanadaRailPerformance | undefined;
                  const faostatWidget = grainDataByKind["FAOSTAT_PP_MULTI_COUNTRY"] as GrainWidgetFaostatPpMultiCountry | undefined;
                  const fpmaWidget = grainDataByKind["FPMA_MARKET_PRICES_MULTI_COUNTRY"] as GrainWidgetFpmaMarketPricesMultiCountry | undefined;
                  const macroEmbedRenderable =
                    !!macroWidget &&
                    macroWidget.renderMode === "embed" &&
                    allowMacroEmbedFrames &&
                    macroWidget.embed?.status === "AVAILABLE" &&
                    isValidEmbedUrl(macroWidget.embed?.embedUrl);
                  const macroEmbedUnavailable =
                    !!macroWidget &&
                    macroWidget.renderMode === "embed" &&
                    !macroEmbedRenderable;

                  return (
                    <>
                      {cashWidget ? (
                        <Card className="xl:col-span-6 h-full border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{cashWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(cashWidget.status)}`}>{cashWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{cashWidget.subtitle || "USDA cash grains / bids"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(cashWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {sortRowsForView(cashWidget.rows, grainGroupBy).map((row) => (
                              <GrainDataRow key={row.id} row={row} priceDisplayMode={priceDisplayMode} debugEnabled={debugEnabled} />
                            ))}
                            {!cashWidget.rows.length ? (
                              <p className="text-sm text-foreground/72">No rows available from source.</p>
                            ) : null}
                            <div className="sm:col-span-2 lg:col-span-3">
                              <StatusSourceStrip
                                compact
                                status={cashWidget.status}
                                statusClassName={grainStatusClass(cashWidget.status)}
                                sourceName={cashWidget.sourceName}
                                sourceUrl={cashWidget.sourceUrl}
                                updatedLabel={cashWidget.updatedAt ? formatRelative(cashWidget.updatedAt) : cashWidget.timeframe}
                                fallbackReason={cashWidget.fallbackReason}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("US_CASH_BIDS") ? "Cash (US)" : "Cash (US) (not configured)"}
                            subtitle="USDA cash grains / regional bids"
                          />
                        </div>
                      )}

                      {spotWidget ? (
                        <Card className="xl:col-span-6 h-full border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{spotWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(spotWidget.status)}`}>{spotWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{spotWidget.subtitle || "Wheat / Corn / Soy / Rapeseed"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(spotWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-1.5 sm:grid-cols-2">
                            {sortRowsForView(spotWidget.rows, grainGroupBy).map((row) => (
                              <GrainDataRow key={row.id} row={row} priceDisplayMode={priceDisplayMode} debugEnabled={debugEnabled} />
                            ))}
                            {!spotWidget.rows.length ? (
                              <p className="text-sm text-foreground/72">No rows available from source.</p>
                            ) : null}
                            <div className="sm:col-span-2">
                              <StatusSourceStrip
                                compact
                                status={spotWidget.status}
                                statusClassName={grainStatusClass(spotWidget.status)}
                                sourceName={spotWidget.sourceName}
                                sourceUrl={spotWidget.sourceUrl}
                                updatedLabel={spotWidget.updatedAt ? formatRelative(spotWidget.updatedAt) : spotWidget.timeframe}
                                fallbackReason={spotWidget.fallbackReason}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("GLOBAL_SPOT_TABLE") ? "Spot (Global)" : "Spot (Global) (not configured)"}
                            subtitle="Wheat / Corn / Soy / Rapeseed"
                          />
                        </div>
                      )}

                      {ecCerealsWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{ecCerealsWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(ecCerealsWidget.status)}`}>{ecCerealsWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{ecCerealsWidget.subtitle || "EC official cereals prices by member state"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(ecCerealsWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={ecCerealsWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {ecCerealsWidget.rows.slice(0, 5).map((row, idx) => (
                                <div key={`${ecCerealsWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={row.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "price", value: row.current, unit: row.unit })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}</p>
                                  {row.secondaryValueText ? <p className="text-[10px] text-foreground/55">{row.secondaryValueText}</p> : null}
                                  <DynamicMiniTrend
                                    series={row.series || []}
                                    change={row.changeAbs}
                                    changePct={row.changePct}
                                    status={ecCerealsWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={ecCerealsWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: ecCerealsWidget.status,
                                      sourceName: ecCerealsWidget.sourceName,
                                      fallbackReason: ecCerealsWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!ecCerealsWidget.rows.length ? <p className="text-[11px] text-foreground/68">No cereals rows mapped for selected member state.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {ecCerealsWidget.summary?.coverage ? <MetricChip label={`coverage ${ecCerealsWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {ecCerealsWidget.summary?.cadence ? <MetricChip label={`cadence ${ecCerealsWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={ecCerealsWidget.status}
                              statusClassName={grainStatusClass(ecCerealsWidget.status)}
                              sourceName={ecCerealsWidget.sourceName}
                              sourceUrl={ecCerealsWidget.sourceUrl}
                              updatedLabel={ecCerealsWidget.updatedAt ? formatRelative(ecCerealsWidget.updatedAt) : ecCerealsWidget.timeframe}
                              fallbackReason={ecCerealsWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("EC_CEREALS_MULTI_COUNTRY") ? "EU Official Cereals" : "EU Official Cereals (not configured)"}
                            subtitle="EC agri-food cereals prices"
                          />
                        </div>
                      )}

                      {ecOilseedsWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{ecOilseedsWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(ecOilseedsWidget.status)}`}>{ecOilseedsWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{ecOilseedsWidget.subtitle || "EC official oilseeds prices by member state"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(ecOilseedsWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={ecOilseedsWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {ecOilseedsWidget.rows.slice(0, 4).map((row, idx) => (
                                <div key={`${ecOilseedsWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={row.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "price", value: row.current, unit: row.unit })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}</p>
                                  {row.secondaryValueText ? <p className="text-[10px] text-foreground/55">{row.secondaryValueText}</p> : null}
                                  <DynamicMiniTrend
                                    series={row.series || []}
                                    change={row.changeAbs}
                                    changePct={row.changePct}
                                    status={ecOilseedsWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={ecOilseedsWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: ecOilseedsWidget.status,
                                      sourceName: ecOilseedsWidget.sourceName,
                                      fallbackReason: ecOilseedsWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!ecOilseedsWidget.rows.length ? <p className="text-[11px] text-foreground/68">No oilseeds rows mapped for selected member state.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {ecOilseedsWidget.summary?.coverage ? <MetricChip label={`coverage ${ecOilseedsWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {ecOilseedsWidget.summary?.cadence ? <MetricChip label={`cadence ${ecOilseedsWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={ecOilseedsWidget.status}
                              statusClassName={grainStatusClass(ecOilseedsWidget.status)}
                              sourceName={ecOilseedsWidget.sourceName}
                              sourceUrl={ecOilseedsWidget.sourceUrl}
                              updatedLabel={ecOilseedsWidget.updatedAt ? formatRelative(ecOilseedsWidget.updatedAt) : ecOilseedsWidget.timeframe}
                              fallbackReason={ecOilseedsWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("EC_OILSEEDS_MULTI_COUNTRY") ? "EU Official Oilseeds" : "EU Official Oilseeds (not configured)"}
                            subtitle="EC agri-food oilseeds prices"
                          />
                        </div>
                      )}

                      {usdaNassWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{usdaNassWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(usdaNassWidget.status)}`}>{usdaNassWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{usdaNassWidget.subtitle || "US official producer price statistics"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(usdaNassWidget)} variant="unit" tone="neutral" />
                              {usdaNassWidget.summary?.cadence ? <MetricChip label={`cadence ${usdaNassWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {usdaNassWidget.rows.slice(0, 3).map((row) => (
                                <GrainDataRow key={row.id} row={row} priceDisplayMode={priceDisplayMode} debugEnabled={debugEnabled} />
                              ))}
                              {!usdaNassWidget.rows.length ? <p className="text-[11px] text-foreground/68">No NASS crop rows available in current cycle.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {usdaNassWidget.summary?.coverage ? <MetricChip label={`coverage ${usdaNassWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={usdaNassWidget.status}
                              statusClassName={grainStatusClass(usdaNassWidget.status)}
                              sourceName={usdaNassWidget.sourceName}
                              sourceUrl={usdaNassWidget.sourceUrl}
                              updatedLabel={usdaNassWidget.updatedAt ? formatRelative(usdaNassWidget.updatedAt) : usdaNassWidget.timeframe}
                              fallbackReason={usdaNassWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("USDA_NASS_PRODUCER_PRICES") ? "US Producer Prices (NASS)" : "US Producer Prices (NASS) (not configured)"}
                            subtitle="US official producer/statistical layer"
                          />
                        </div>
                      )}

                      {wfpWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{wfpWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(wfpWidget.status)}`}>{wfpWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{wfpWidget.subtitle || "WFP multi-country market surveillance"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(wfpWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={wfpWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {wfpWidget.rows.slice(0, 4).map((row, idx) => (
                                <div key={`${wfpWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={row.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">{formatMetricValue({ kind: "price", value: row.current, unit: row.unit })}</p>
                                  <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}</p>
                                  <DynamicMiniTrend
                                    series={row.series || []}
                                    change={row.changeAbs}
                                    changePct={row.changePct}
                                    status={wfpWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={wfpWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: wfpWidget.status,
                                      sourceName: wfpWidget.sourceName,
                                      fallbackReason: wfpWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!wfpWidget.rows.length ? <p className="text-[11px] text-foreground/68">No WFP rows mapped for selected territory.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {wfpWidget.summary?.coverage ? <MetricChip label={`coverage ${wfpWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {wfpWidget.summary?.cadence ? <MetricChip label={`cadence ${wfpWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip compact status={wfpWidget.status} statusClassName={grainStatusClass(wfpWidget.status)} sourceName={wfpWidget.sourceName} sourceUrl={wfpWidget.sourceUrl} updatedLabel={wfpWidget.updatedAt ? formatRelative(wfpWidget.updatedAt) : wfpWidget.timeframe} fallbackReason={wfpWidget.fallbackReason} />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("WFP_MARKET_PRICES_MULTI_COUNTRY") ? "WFP Market Prices" : "WFP Market Prices (not configured)"}
                            subtitle="WFP HAPI / humanitarian market surveillance"
                          />
                        </div>
                      )}

                      {worldBankWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{worldBankWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(worldBankWidget.status)}`}>{worldBankWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{worldBankWidget.subtitle || "World Bank microdata market price layer"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(worldBankWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={worldBankWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {worldBankWidget.rows.slice(0, 4).map((row, idx) => (
                                <div key={`${worldBankWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={row.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">{formatMetricValue({ kind: "price", value: row.current, unit: row.unit })}</p>
                                  <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}</p>
                                  <DynamicMiniTrend
                                    series={row.series || []}
                                    change={row.changeAbs}
                                    changePct={row.changePct}
                                    status={worldBankWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={worldBankWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: worldBankWidget.status,
                                      sourceName: worldBankWidget.sourceName,
                                      fallbackReason: worldBankWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!worldBankWidget.rows.length ? <p className="text-[11px] text-foreground/68">No World Bank rows mapped for selected territory.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {worldBankWidget.summary?.coverage ? <MetricChip label={`coverage ${worldBankWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {worldBankWidget.summary?.cadence ? <MetricChip label={`cadence ${worldBankWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip compact status={worldBankWidget.status} statusClassName={grainStatusClass(worldBankWidget.status)} sourceName={worldBankWidget.sourceName} sourceUrl={worldBankWidget.sourceUrl} updatedLabel={worldBankWidget.updatedAt ? formatRelative(worldBankWidget.updatedAt) : worldBankWidget.timeframe} fallbackReason={worldBankWidget.fallbackReason} />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("WB_MICRODATA_MARKET_PRICES") ? "World Bank Market Prices" : "World Bank Market Prices (not configured)"}
                            subtitle="World Bank Microdata / food prices"
                          />
                        </div>
                      )}

                      {eurostatWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{eurostatWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(eurostatWidget.status)}`}>{eurostatWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{eurostatWidget.subtitle || "EU country agricultural price index layer"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(eurostatWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={eurostatWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1 sm:grid-cols-2">
                              {eurostatWidget.items.slice(0, 4).map((item, idx) => (
                                <div key={`${eurostatWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{item.indexName}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={item.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={item.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">{formatMetricValue({ kind: "index", value: item.current, unit: item.unit })}</p>
                                  <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: item.changeAbs, unit: item.unit, pct: item.changePct })}</p>
                                  <DynamicMiniTrend
                                    series={item.series || []}
                                    change={item.changeAbs}
                                    changePct={item.changePct}
                                    status={eurostatWidget.status}
                                    section="expansion"
                                    cardKind="index"
                                    sourceName={eurostatWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: eurostatWidget.status,
                                      sourceName: eurostatWidget.sourceName,
                                      fallbackReason: eurostatWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!eurostatWidget.items.length ? <p className="text-[11px] text-foreground/68">No Eurostat index items mapped for selected territory.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {eurostatWidget.summary?.coverage ? <MetricChip label={`coverage ${eurostatWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {eurostatWidget.summary?.cadence ? <MetricChip label={`cadence ${eurostatWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip compact status={eurostatWidget.status} statusClassName={grainStatusClass(eurostatWidget.status)} sourceName={eurostatWidget.sourceName} sourceUrl={eurostatWidget.sourceUrl} updatedLabel={eurostatWidget.updatedAt ? formatRelative(eurostatWidget.updatedAt) : eurostatWidget.timeframe} fallbackReason={eurostatWidget.fallbackReason} />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("EUROSTAT_AGRI_PRICE_INDICES") ? "Eurostat Agri Indices" : "Eurostat Agri Indices (not configured)"}
                            subtitle="EU agricultural price indices"
                          />
                        </div>
                      )}

                      {faostatWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{faostatWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(faostatWidget.status)}`}>{faostatWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{faostatWidget.subtitle || "FAOSTAT PP by selected territory"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(faostatWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={faostatWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {faostatWidget.rows.slice(0, 5).map((row, idx) => (
                                <div key={`${faostatWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={row.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "price", value: row.current, unit: row.unit })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">
                                    {formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}
                                  </p>
                                  <DynamicMiniTrend
                                    series={row.series || []}
                                    change={row.changeAbs}
                                    changePct={row.changePct}
                                    status={faostatWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={faostatWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: faostatWidget.status,
                                      sourceName: faostatWidget.sourceName,
                                      fallbackReason: faostatWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!faostatWidget.rows.length ? (
                                <p className="text-[11px] text-foreground/68">No crop rows mapped for selected territory.</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {faostatWidget.summary?.coverage ? <MetricChip label={`coverage ${faostatWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {faostatWidget.summary?.cadence ? <MetricChip label={`cadence ${faostatWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                              {debugEnabled && faostatWidget.debug?.elementCode ? <MetricChip label={`element ${faostatWidget.debug.elementCode}`} variant="provider" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={faostatWidget.status}
                              statusClassName={grainStatusClass(faostatWidget.status)}
                              sourceName={faostatWidget.sourceName}
                              sourceUrl={faostatWidget.sourceUrl}
                              updatedLabel={faostatWidget.updatedAt ? formatRelative(faostatWidget.updatedAt) : faostatWidget.timeframe}
                              fallbackReason={faostatWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("FAOSTAT_PP_MULTI_COUNTRY") ? "Regional Producer Prices (FAOSTAT)" : "Regional Producer Prices (FAOSTAT) (not configured)"}
                            subtitle="Multi-country producer price snapshot"
                          />
                        </div>
                      )}

                      {fpmaWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">FPMA — Domestic Market Prices (wholesale/retail)</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(fpmaWidget.status)}`}>{fpmaWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{fpmaWidget.subtitle || "FAO FPMA domestic prices by selected territory"}</CardDescription>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(fpmaWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={fpmaWidget} value={grainCountry} onChange={setGrainCountry} />
                              {fpmaWidget.selector?.priceType?.options?.length ? (
                                <select
                                  value={grainPriceType}
                                  onChange={(event) => setGrainPriceType(event.target.value === "RETAIL" ? "RETAIL" : "WHOLESALE")}
                                  className="h-7 rounded-md border border-black/60 bg-background/80 px-2 text-[10px] uppercase tracking-wide text-foreground dark:border-white/30"
                                  aria-label="FPMA price type selector"
                                >
                                  {fpmaWidget.selector.priceType.options.map((option) => (
                                    <option key={`fpma-type-${option}`} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {fpmaWidget.rows.slice(0, 5).map((row, idx) => (
                                <div key={`${fpmaWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                      <MetricChip label={row.cadence} variant="type" tone="muted" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "price", value: row.current, unit: row.unit })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">
                                    {formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}
                                  </p>
                                  <DynamicMiniTrend
                                    series={row.series || []}
                                    change={row.changeAbs}
                                    changePct={row.changePct}
                                    status={fpmaWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={fpmaWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: fpmaWidget.status,
                                      sourceName: fpmaWidget.sourceName,
                                      fallbackReason: fpmaWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!fpmaWidget.rows.length ? (
                                <p className="text-[11px] text-foreground/68">No FPMA crop rows available for selected territory.</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {fpmaWidget.summary?.coverage ? <MetricChip label={`coverage ${fpmaWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {fpmaWidget.summary?.cadence ? <MetricChip label={`cadence ${fpmaWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                              {fpmaWidget.summary?.selectedPriceType ? <MetricChip label={`type ${fpmaWidget.summary.selectedPriceType.toLowerCase()}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={fpmaWidget.status}
                              statusClassName={grainStatusClass(fpmaWidget.status)}
                              sourceName={fpmaWidget.sourceName}
                              sourceUrl={fpmaWidget.sourceUrl}
                              updatedLabel={fpmaWidget.updatedAt ? formatRelative(fpmaWidget.updatedAt) : fpmaWidget.timeframe}
                              fallbackReason={fpmaWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("FPMA_MARKET_PRICES_MULTI_COUNTRY") ? "Domestic Market Prices (FPMA)" : "Domestic Market Prices (FPMA) (not configured)"}
                            subtitle="Multi-country domestic market prices"
                          />
                        </div>
                      )}

                      {indexWidget ? (
                        <Card className="xl:col-span-4 h-full border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{indexWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(indexWidget.status)}`}>{indexWidget.status}</Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <MetricChip label={territoryChipLabel(indexWidget)} variant="unit" tone="neutral" />
                              <TerritorySelector widget={indexWidget} value={grainCountry} onChange={setGrainCountry} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            {indexWidget.cards.map((card) => (
                              <div key={card.id} className="rounded-md border border-black/70 dark:border-white/30 bg-muted/55 p-2">
                                <p className="text-[11px] text-foreground/72">{card.label}</p>
                                <p className="text-lg font-semibold text-foreground">
                                  {card.value == null ? card.valueText || "n/a" : formatIndexPoints(card.value)}
                                </p>
                                <p className="text-[10px] text-foreground/65">{card.deltaPct == null ? "n/a" : `${card.deltaPct >= 0 ? "+" : ""}${card.deltaPct.toFixed(2)}%`}</p>
                                <DynamicMiniTrend
                                  series={card.series || []}
                                  change={card.delta}
                                  changePct={card.deltaPct}
                                  status={card.status || indexWidget.status}
                                  section="expansion"
                                  cardKind="index"
                                  trustedSeries={isTrustworthySeriesSource({
                                    status: card.status || indexWidget.status,
                                    sourceName: indexWidget.sourceName,
                                    fallbackReason: indexWidget.fallbackReason,
                                  })}
                                  sourceName={indexWidget.sourceName}
                                  debugEnabled={debugEnabled}
                                />
                              </div>
                            ))}
                            {indexWidget.weatherTieIn ? (
                              <div className="rounded-md border border-black/70 dark:border-white/30 bg-muted/55 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] text-foreground/68">
                                    {indexWidget.weatherTieIn.available ? `Weather-linked signal: ${formatMetricValue({ kind: "score", value: indexWidget.weatherTieIn.score })}` : "Weather tie-in: unavailable"}
                                  </p>
                                  <MetricChip label="SIGNAL" variant="type" tone="muted" />
                                </div>
                                {indexWidget.weatherTieIn.score != null ? (
                                  <IntensityBar
                                    compact
                                    className="mt-1"
                                    value={Math.min(100, Math.max(0, Math.round(indexWidget.weatherTieIn.score)))}
                                    direction="up"
                                  />
                                ) : null}
                              </div>
                            ) : null}
                            {!indexWidget.cards.length ? (
                              <p className="text-sm text-foreground/72">No composite cards available from source.</p>
                            ) : null}
                            <StatusSourceStrip
                              compact
                              status={indexWidget.status}
                              statusClassName={grainStatusClass(indexWidget.status)}
                              sourceName={indexWidget.sourceName}
                              sourceUrl={indexWidget.sourceUrl}
                              updatedLabel={indexWidget.updatedAt ? formatRelative(indexWidget.updatedAt) : indexWidget.timeframe}
                              fallbackReason={indexWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-4">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("CROP_PRICE_INDEX") ? "Index (Composite)" : "Index (Composite) (not configured)"}
                            subtitle="Crop price composite"
                          />
                        </div>
                      )}

                      {futuresWidget ? (
                        <Card className="xl:col-span-8 h-full border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{futuresWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(futuresWidget.status)}`}>{futuresWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{futuresWidget.subtitle || "Intraday futures snapshot"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(futuresWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-1.5 md:grid-cols-3">
                            {sortRowsForView(futuresWidget.rows, grainGroupBy).map((row) => (
                              <GrainDataRow key={row.id} row={row} priceDisplayMode={priceDisplayMode} debugEnabled={debugEnabled} />
                            ))}
                            {!futuresWidget.rows.length ? (
                              <p className="text-sm text-foreground/72">No futures rows parsed from source.</p>
                            ) : null}
                            <div className="md:col-span-3">
                              <StatusSourceStrip
                                compact
                                status={futuresWidget.status}
                                statusClassName={grainStatusClass(futuresWidget.status)}
                                sourceName={futuresWidget.sourceName}
                                sourceUrl={futuresWidget.sourceUrl}
                                updatedLabel={futuresWidget.updatedAt ? formatRelative(futuresWidget.updatedAt) : futuresWidget.timeframe}
                                fallbackReason={futuresWidget.fallbackReason}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-8">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("CBOT_FUTURES_SNAPSHOT") ? "Futures (CBOT)" : "Futures (CBOT) (not configured)"}
                            subtitle="Intraday futures snapshot"
                          />
                        </div>
                      )}

                      {livestockWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{livestockWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(livestockWidget.status)}`}>{livestockWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{livestockWidget.subtitle || "Soy meal / feed-side indicators"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(livestockWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {sortRowsForView(livestockWidget.rows, grainGroupBy).map((row) => (
                                <GrainDataRow key={row.id} row={row} priceDisplayMode={priceDisplayMode} debugEnabled={debugEnabled} />
                              ))}
                            </div>
                            {livestockWidget.summary?.derivedCue ? (
                              <div className="rounded-md border border-black/70 dark:border-white/30 bg-muted/55 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] text-foreground/68">
                                    Derived cue: {livestockWidget.summary.derivedCue.label}
                                    {livestockWidget.summary.derivedCue.score != null ? ` (${Math.round(livestockWidget.summary.derivedCue.score)})` : ""}
                                  </p>
                                  <MetricChip label="SIGNAL" variant="type" tone="muted" />
                                </div>
                                {livestockWidget.summary.derivedCue.score != null ? (
                                  <IntensityBar
                                    compact
                                    className="mt-1"
                                    value={Math.min(100, Math.max(0, Math.round(livestockWidget.summary.derivedCue.score)))}
                                    direction={
                                      livestockWidget.summary.derivedCue.label === "Soft"
                                        ? "down"
                                        : livestockWidget.summary.derivedCue.label === "Mixed"
                                          ? "flat"
                                          : "up"
                                    }
                                  />
                                ) : null}
                              </div>
                            ) : null}
                            <StatusSourceStrip
                              compact
                              status={livestockWidget.status}
                              statusClassName={grainStatusClass(livestockWidget.status)}
                              sourceName={livestockWidget.sourceName}
                              sourceUrl={livestockWidget.sourceUrl}
                              updatedLabel={livestockWidget.updatedAt ? formatRelative(livestockWidget.updatedAt) : livestockWidget.timeframe}
                              fallbackReason={livestockWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("LIVESTOCK_FEED_TIEIN") ? "Feed / Livestock Tie-in" : "Feed / Livestock Tie-in (not configured)"}
                            subtitle="Soy meal, feed-side demand and linked cues"
                          />
                        </div>
                      )}

                      {macroWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/75 dark:border-white/40 bg-gradient-to-b from-card to-muted/25 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{macroWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(macroWidget.status)}`}>{macroWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/70">{macroWidget.subtitle || "Macro agri index context"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(macroWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            {macroEmbedUnavailable ? (
                              <div className="rounded-md border border-black/60 dark:border-white/30 bg-muted/50 p-2.5">
                                <p className="text-sm font-semibold text-foreground">Embed unavailable</p>
                                <p className="mt-1 text-[11px] text-foreground/68">
                                  {macroWidget.summary?.modeReason || (!allowMacroEmbedFrames ? "Embed previews are disabled in hero for demo polish. External source is available." : "Embed is blocked by source policy or URL is invalid. External source is available.")}
                                </p>
                                {macroWidget.embed?.externalUrl ? (
                                  <a
                                    href={macroWidget.embed.externalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex rounded-md border border-black/75 dark:border-white/40 px-2 py-1 text-[10px] font-medium hover:bg-muted/50"
                                  >
                                    Open Source
                                  </a>
                                ) : null}
                              </div>
                            ) : null}

                            {macroEmbedRenderable ? (
                              <div className="overflow-hidden rounded-md border border-black/70 dark:border-white/30 bg-muted/40">
                                <iframe
                                  src={macroWidget.embed?.embedUrl}
                                  title={macroWidget.embed?.title || "Macro Agri Embed"}
                                  className="h-[280px] w-full"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : null}

                            {!!macroWidget.items?.length && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {macroWidget.items.map((item) => (
                                  <div key={item.id} className="rounded-md border border-black/70 dark:border-white/30 bg-muted/55 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-[11px] font-semibold text-foreground">{item.label}</p>
                                        <div className="mt-0.5 flex items-center gap-1">
                                          <MetricChip
                                            label={item.metricSemanticKind === "price" ? "PRICE" : item.metricSemanticKind.toUpperCase()}
                                            variant="type"
                                            tone={item.metricSemanticKind === "price" ? "neutral" : "muted"}
                                          />
                                        </div>
                                      </div>
                                      {item.status ? <Badge className={`text-[10px] ${grainStatusClass(item.status)}`}>{item.status}</Badge> : null}
                                    </div>
                                    {item.metricSemanticKind === "price" && item.price ? (
                                      (() => {
                                        const display = formatWidgetRowPrice({ id: item.id, label: item.label, price: item.price }, priceDisplayMode);
                                        const unitLabel = display.unit
                                          ? display.unit.includes("/") || display.unit.toLowerCase().includes("usd") || display.unit.toLowerCase().includes("eur")
                                            ? display.unit
                                            : `${display.currency || ""}/${display.unit}`
                                          : display.currency || "";
                                        return (
                                          <>
                                            <p className="mt-1 text-lg font-semibold text-foreground">
                                              {formatNumber(display.value)}
                                              <span className="ml-1 text-[10px] font-medium text-foreground/65">{unitLabel}</span>
                                            </p>
                                            <p className="text-[10px] text-foreground/68">
                                              {display.change == null ? "No delta" : formatChangeWithUnit({ change: display.change, unit: unitLabel, pct: display.changePct })}
                                            </p>
                                            <IntensityBar
                                              compact
                                              className="mt-1"
                                              value={trendIntensity(display.change, display.changePct)}
                                              direction={trendDirection(display.change, display.changePct)}
                                            />
                                            <DynamicMiniTrend
                                              series={item.series || []}
                                              change={display.change}
                                              changePct={display.changePct}
                                              status={item.status || macroWidget.status}
                                              section="expansion"
                                              cardKind="index"
                                              trustedSeries={isTrustworthySeriesSource({
                                                status: item.status || macroWidget.status,
                                                sourceName: item.sourceName || macroWidget.sourceName,
                                                fallbackReason: macroWidget.fallbackReason,
                                              })}
                                              sourceName={item.sourceName || macroWidget.sourceName}
                                              debugEnabled={debugEnabled}
                                            />
                                            {display.secondary ? <p className="text-[10px] text-foreground/68">{display.secondary}</p> : null}
                                          </>
                                        );
                                      })()
                                    ) : (
                                      <>
                                        <p className="mt-1 text-lg font-semibold text-foreground">
                                          {item.valueCurrent == null ? "n/a" : item.unitLabel?.toLowerCase().includes("score")
                                            ? formatMetricValue({ kind: "score", value: item.valueCurrent })
                                            : formatIndexPoints(item.valueCurrent)}
                                          {item.valueCurrent != null ? <span className="ml-1 text-[10px] font-medium text-foreground/65">{item.unitLabel || "pts"}</span> : null}
                                        </p>
                                        <p className="text-[10px] text-foreground/68">
                                          {(item.valueChangePct != null ? formatPercent(item.valueChangePct) : "No delta")} • {item.metricSemanticKind}
                                        </p>
                                        <IntensityBar
                                          compact
                                          className="mt-1"
                                          value={trendIntensity(item.valueChange, item.valueChangePct)}
                                          direction={trendDirection(item.valueChange, item.valueChangePct)}
                                        />
                                        <DynamicMiniTrend
                                          series={item.series || []}
                                          change={item.valueChange}
                                          changePct={item.valueChangePct}
                                          status={item.status || macroWidget.status}
                                          section="expansion"
                                          cardKind="index"
                                          trustedSeries={isTrustworthySeriesSource({
                                            status: item.status || macroWidget.status,
                                            sourceName: item.sourceName || macroWidget.sourceName,
                                            fallbackReason: macroWidget.fallbackReason,
                                          })}
                                          sourceName={item.sourceName || macroWidget.sourceName}
                                          debugEnabled={debugEnabled}
                                        />
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {!!macroWidget.cards?.length && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {macroWidget.cards.map((card) => (
                                  <div key={card.id} className="rounded-md border border-black/70 dark:border-white/30 bg-muted/55 p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] text-foreground/72">{card.label}</p>
                                      <MetricChip label="INDEX" variant="type" tone="muted" />
                                    </div>
                                    <p className="text-base font-semibold text-foreground">
                                      {card.value == null ? card.valueText || "n/a" : formatIndexPoints(card.value)}
                                    </p>
                                    <IntensityBar
                                      compact
                                      className="mt-1"
                                      value={trendIntensity(undefined, card.deltaPct)}
                                      direction={trendDirection(undefined, card.deltaPct)}
                                    />
                                    <DynamicMiniTrend
                                      series={card.series || []}
                                      changePct={card.deltaPct}
                                      status={card.status || macroWidget.status}
                                      section="expansion"
                                      cardKind="index"
                                      trustedSeries={isTrustworthySeriesSource({
                                        status: card.status || macroWidget.status,
                                        sourceName: macroWidget.sourceName,
                                        fallbackReason: macroWidget.fallbackReason,
                                      })}
                                      sourceName={macroWidget.sourceName}
                                      debugEnabled={debugEnabled}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                            <StatusSourceStrip
                              compact
                              status={macroWidget.status}
                              statusClassName={grainStatusClass(macroWidget.status)}
                              sourceName={macroWidget.sourceName}
                              sourceUrl={macroWidget.sourceUrl}
                              updatedLabel={macroWidget.updatedAt ? formatRelative(macroWidget.updatedAt) : macroWidget.timeframe}
                              fallbackReason={macroWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("MACRO_AGRI_INDICES") ? "Macro Agri Indices" : "Macro Agri Indices (not configured)"}
                            subtitle="API/Embed macro index context with fallback"
                          />
                        </div>
                      )}

                      {marsWidget ? (
                        <Card className={`${usContextWidget ? "xl:col-span-6" : "xl:col-span-12"} h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm`}>
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{marsWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(marsWidget.status)}`}>{marsWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{marsWidget.subtitle || "Metadata-only grain market report flow"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(marsWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            {marsWidget.reports.length ? (
                              <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                                {marsWidget.reports.map((report) => (
                                  <a
                                    key={report.id}
                                    href={report.sourceUrl || marsWidget.sourceUrl || "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block rounded-md border border-black/60 dark:border-white/25 bg-background/50 p-1.5 hover:border-primary/40"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] font-semibold text-foreground line-clamp-1">{report.category || "Report"}</p>
                                      <MetricChip label={report.fileType || "OTHER"} variant="type" tone="muted" />
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-foreground/85 line-clamp-2">{report.title}</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {report.tags?.type ? (
                                        <MetricChip label={report.tags.type} variant="type" tone="muted" />
                                      ) : null}
                                      {report.tags?.region ? (
                                        <MetricChip label={report.tags.region} variant="provider" tone="neutral" />
                                      ) : null}
                                      {report.tags?.crops?.slice(0, 2).map((crop: string) => (
                                        <MetricChip key={`${report.id}-${crop}`} label={crop.toUpperCase()} variant="unit" tone="accent" />
                                      ))}
                                    </div>
                                    <p className="mt-1 text-[10px] text-foreground/65">
                                      {report.reportId ? `ID ${report.reportId}` : "ID n/a"} • {report.publishedAt ? formatRelative(report.publishedAt) : "date n/a"}
                                    </p>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-foreground/72">No grain-relevant reports matched current keyword filter.</p>
                            )}
                            <div className="flex items-center justify-between gap-2 text-[10px] text-foreground/65">
                              <span>
                                {`reports ${marsWidget.summary?.shownCount ?? marsWidget.reports.length}/${marsWidget.summary?.matchedCount ?? marsWidget.reports.length} matched`}
                              </span>
                              <span>
                                {`scanned ${marsWidget.summary?.scannedCount ?? marsWidget.summary?.fetchedCount ?? 0}`}
                                {typeof marsWidget.summary?.excludedCount === "number" ? ` • excluded ${marsWidget.summary.excludedCount}` : ""}
                                {typeof marsWidget.summary?.moreReportsCount === "number" && marsWidget.summary.moreReportsCount > 0
                                  ? ` • +${marsWidget.summary.moreReportsCount} more`
                                  : ""}
                              </span>
                            </div>
                            <StatusSourceStrip
                              compact
                              status={marsWidget.status}
                              statusClassName={grainStatusClass(marsWidget.status)}
                              sourceName={marsWidget.sourceName}
                              sourceUrl={marsWidget.sourceUrl}
                              updatedLabel={marsWidget.updatedAt ? formatRelative(marsWidget.updatedAt) : marsWidget.timeframe}
                              fallbackReason={marsWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className={`${usContextWidget ? "xl:col-span-6" : "xl:col-span-12"}`}>
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("USDA_MARS_REPORTS") ? "USDA MARS Grain Reports" : "USDA MARS Grain Reports (not configured)"}
                            subtitle="Metadata-driven report context"
                          />
                        </div>
                      )}

                      {usContextWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{usContextWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(usContextWidget.status)}`}>{usContextWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">
                              {usContextWidget.subtitle || "Metadata-only: daily bids & export indications"}
                            </CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(usContextWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5 rounded-md border border-black/60 dark:border-white/25 bg-background/50 p-1.5 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-foreground/72">Export indications</span>
                                <MetricChip label={usContextWidget.summary.exportIndications ? "YES" : "NO"} variant="type" tone={usContextWidget.summary.exportIndications ? "accent" : "muted"} />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-foreground/72">Daily bids</span>
                                <MetricChip label={usContextWidget.summary.dailyBids ? "YES" : "NO"} variant="type" tone={usContextWidget.summary.dailyBids ? "accent" : "muted"} />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-foreground/72">Market rates</span>
                                <MetricChip label={usContextWidget.summary.marketRates ? "YES" : "NO"} variant="type" tone={usContextWidget.summary.marketRates ? "accent" : "muted"} />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-foreground/72">Reports today</span>
                                <MetricChip label={`${usContextWidget.summary.reportsToday} reports`} variant="unit" tone="neutral" />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {usContextWidget.summary.regions.map((region) => (
                                <MetricChip key={`${usContextWidget.id}-${region}`} label={region} variant="provider" tone="neutral" />
                              ))}
                              {(usContextWidget.summary.cadenceHints || []).map((hint) => (
                                <MetricChip key={`${usContextWidget.id}-${hint}`} label={hint} variant="type" tone="muted" />
                              ))}
                            </div>
                            <div className="grid gap-1.5">
                              {usContextWidget.topReports.slice(0, 3).map((report) => (
                                <a
                                  key={report.id}
                                  href={report.url || usContextWidget.sourceUrl || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block rounded-md border border-black/60 dark:border-white/25 bg-background/45 p-1.5 hover:border-primary/45"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] text-foreground/86 line-clamp-1">{report.title}</p>
                                    <MetricChip label={report.fileType || "OTHER"} variant="type" tone="muted" />
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-foreground/65">
                                    {(report.typeTag || "Report") + (report.regionTag ? ` • ${report.regionTag}` : "")}
                                    {report.publishedAt ? ` • ${formatRelative(report.publishedAt)}` : ""}
                                  </p>
                                </a>
                              ))}
                              {!usContextWidget.topReports.length ? (
                                <p className="text-[11px] text-foreground/68">No USDA links in current window. Context is built from open-data anchors.</p>
                              ) : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={usContextWidget.status}
                              statusClassName={grainStatusClass(usContextWidget.status)}
                              sourceName={usContextWidget.sourceName}
                              sourceUrl={usContextWidget.sourceUrl}
                              updatedLabel={usContextWidget.updatedAt ? formatRelative(usContextWidget.updatedAt) : usContextWidget.timeframe}
                              fallbackReason={usContextWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("US_CASH_EXPORT_CONTEXT") ? "US Cash / Export Context" : "US Cash / Export Context (not configured)"}
                            subtitle="Metadata-driven US cash/export readout"
                          />
                        </div>
                      )}

                      {marsDailyTxtWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{marsDailyTxtWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(marsDailyTxtWidget.status)}`}>{marsDailyTxtWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{marsDailyTxtWidget.subtitle || "USDA AMS MARS TXT extraction"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(marsDailyTxtWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5">
                              {marsDailyTxtWidget.rows.slice(0, 6).map((row, idx) => (
                                <div key={`${marsDailyTxtWidget.id}-${idx}`} className="rounded-md border border-black/60 dark:border-white/25 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <MetricChip label={row.confidence} variant="type" tone={row.confidence === "HIGH" ? "accent" : "muted"} />
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {`${formatNumber(row.price.nativeValueCurrent)} ${row.price.nativeUnit}`}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">
                                    {`${row.commodity}${row.market ? ` • ${row.market}` : ""}`}
                                    {row.price.normalizedValueCurrent != null ? ` • ${formatNumber(row.price.normalizedValueCurrent)} USD/t` : ""}
                                  </p>
                                </div>
                              ))}
                              {!marsDailyTxtWidget.rows.length ? (
                                <p className="text-[11px] text-foreground/68">No confident rows parsed from TXT in current cycle.</p>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-foreground/65">
                              <span>{`report ${marsDailyTxtWidget.report.reportId} • ${marsDailyTxtWidget.report.fileType.toUpperCase()}`}</span>
                              <span>{`matched ${marsDailyTxtWidget.debug?.linesMatched ?? marsDailyTxtWidget.rows.length}/${marsDailyTxtWidget.debug?.linesFetched ?? 0} lines`}</span>
                            </div>
                            <StatusSourceStrip
                              compact
                              status={marsDailyTxtWidget.status}
                              statusClassName={grainStatusClass(marsDailyTxtWidget.status)}
                              sourceName={marsDailyTxtWidget.sourceName}
                              sourceUrl={marsDailyTxtWidget.report.sourceUrl || marsDailyTxtWidget.sourceUrl}
                              updatedLabel={marsDailyTxtWidget.updatedAt ? formatRelative(marsDailyTxtWidget.updatedAt) : marsDailyTxtWidget.timeframe}
                              fallbackReason={marsDailyTxtWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("USDA_MARS_DAILY_MARKET_RATES_TXT") ? "US Daily Market Rates (TXT)" : "US Daily Market Rates (TXT) (not configured)"}
                            subtitle="USDA AMS MARS TXT parsing"
                          />
                        </div>
                      )}

                      {alphaWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{alphaWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(alphaWidget.status)}`}>{alphaWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{alphaWidget.subtitle || "Open-ish free-key benchmark series"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(alphaWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {alphaWidget.rows.slice(0, 6).map((row) => (
                                <div key={`${alphaWidget.id}-${row.id}`} className="rounded-md border border-black/60 dark:border-white/25 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={row.alphaFunction} variant="type" tone="muted" />
                                      <MetricChip
                                        label={row.unitConfidence === "CONFIRMED" ? "unit ok" : "unit unknown"}
                                        variant="unit"
                                        tone={row.unitConfidence === "CONFIRMED" ? "neutral" : "muted"}
                                      />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "price", value: row.price?.nativeValueCurrent, unit: row.price?.nativeUnit || "USD (unit unknown)" })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">
                                    {formatChangeWithUnit({
                                      change: row.price?.nativeValueChange,
                                      unit: row.price?.nativeUnit || "USD (unit unknown)",
                                      pct: row.momChangePct ?? row.price?.nativeValueChangePct,
                                    })}
                                    {typeof row.yoyChangePct === "number" ? ` • YoY ${row.yoyChangePct >= 0 ? "+" : ""}${row.yoyChangePct.toFixed(2)}%` : ""}
                                  </p>
                                  <DynamicMiniTrend
                                    series={row.price?.series || []}
                                    change={row.price?.nativeValueChange}
                                    changePct={row.momChangePct ?? row.price?.nativeValueChangePct}
                                    status={row.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={row.sourceName || alphaWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: row.status,
                                      sourceName: row.sourceName || alphaWidget.sourceName,
                                      fallbackReason: alphaWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!alphaWidget.rows.length ? (
                                <p className="text-[11px] text-foreground/68">No Alpha Vantage rows mapped in current cycle.</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {alphaWidget.summary?.coverage ? <MetricChip label={`coverage ${alphaWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {alphaWidget.summary?.cadence ? <MetricChip label={`cadence ${alphaWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={alphaWidget.status}
                              statusClassName={grainStatusClass(alphaWidget.status)}
                              sourceName={alphaWidget.sourceName}
                              sourceUrl={alphaWidget.sourceUrl}
                              updatedLabel={alphaWidget.updatedAt ? formatRelative(alphaWidget.updatedAt) : alphaWidget.timeframe}
                              fallbackReason={alphaWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("ALPHAVANTAGE_GRAIN_BENCHMARKS") ? "Alpha Vantage Grain Benchmarks" : "Alpha Vantage Grain Benchmarks (not configured)"}
                            subtitle="Wheat / Corn (free-key source)"
                          />
                        </div>
                      )}

                      {nasdaqWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{nasdaqWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(nasdaqWidget.status)}`}>{nasdaqWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{nasdaqWidget.subtitle || "Macro/gov snapshot from Nasdaq Data Link"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(nasdaqWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            {(() => {
                              const items = nasdaqWidget.items.slice(0, 8);
                              const grouped = NASDAQ_GROUP_DEFS.map((group) => {
                                const groupItems = items.filter((item) => (group.codes as readonly string[]).includes(nasdaqDatasetCode(item.dataset)));
                                const knownCadences = Array.from(new Set(groupItems.map((item) => resolveNasdaqCadence(item)).filter((value) => value !== "unknown")));
                                const sharedCadence = knownCadences.length === 1 ? knownCadences[0] : undefined;
                                return {
                                  ...group,
                                  items: groupItems,
                                  sharedCadence,
                                };
                              }).filter((group) => group.items.length > 0);
                              const uncategorized = items.filter(
                                (item) => !NASDAQ_GROUP_DEFS.some((group) => (group.codes as readonly string[]).includes(nasdaqDatasetCode(item.dataset))),
                              );

                              if (!grouped.length && !uncategorized.length) {
                                return <p className="text-[11px] text-foreground/68">No Nasdaq Data Link series mapped in current cycle.</p>;
                              }

                              return (
                                <div className="space-y-1.5">
                                  {grouped.map((group) => (
                                    <div key={`${nasdaqWidget.id}-${group.id}`} className="rounded-md border border-black/55 dark:border-white/22 bg-background/40 p-1.5">
                                      <div className="mb-1 flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/78">{group.title}</p>
                                        <div className="flex items-center gap-1">
                                          {group.sharedCadence ? <MetricChip label={group.sharedCadence} variant="type" tone="muted" /> : null}
                                        </div>
                                      </div>
                                      <div className="grid gap-1 sm:grid-cols-2">
                                        {group.items.map((item) => {
                                          const cadence = resolveNasdaqCadence(item);
                                          const unit = resolveNasdaqUnitLabel(item);
                                          const series = nasdaqSeriesPoints(item);
                                          return (
                                            <div key={`${nasdaqWidget.id}-${group.id}-${item.id}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                              <div className="flex items-center justify-between gap-1">
                                                <p className="text-[11px] text-foreground/85 line-clamp-1">{resolveNasdaqLabel(item)}</p>
                                                <div className="flex items-center gap-1">
                                                  <MetricChip label={unit.unit} variant="unit" tone={unit.unknown ? "muted" : "neutral"} />
                                                  {!group.sharedCadence && cadence !== "unknown" ? <MetricChip label={cadence} variant="type" tone="muted" /> : null}
                                                  {!group.sharedCadence && cadence === "unknown" && debugEnabled ? <MetricChip label="unknown cadence" variant="type" tone="muted" /> : null}
                                                </div>
                                              </div>
                                              {debugEnabled ? <p className="text-[9px] text-foreground/55 mt-0.5">{item.dataset}</p> : null}
                                              <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                                {formatMetricValue({ kind: "index", value: item.nativeValueCurrent, unit: unit.unit })}
                                              </p>
                                              <p className="text-[10px] text-foreground/65">
                                                {formatChangeWithUnit({
                                                  change: item.changeAbs,
                                                  unit: unit.unit,
                                                  pct: item.changePct,
                                                })}
                                              </p>
                                              <DynamicMiniTrend
                                                series={series}
                                                change={item.changeAbs}
                                                changePct={item.changePct}
                                                status={nasdaqWidget.status}
                                                section="expansion"
                                                cardKind="row"
                                                sourceName={nasdaqWidget.sourceName}
                                                trustedSeries={isTrustworthySeriesSource({
                                                  status: nasdaqWidget.status,
                                                  sourceName: nasdaqWidget.sourceName,
                                                  fallbackReason: nasdaqWidget.fallbackReason,
                                                })}
                                                debugEnabled={debugEnabled}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  {uncategorized.length ? (
                                    <div className="rounded-md border border-black/50 dark:border-white/20 bg-background/40 p-1.5">
                                      <div className="mb-1 flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/78">Other</p>
                                      </div>
                                      <div className="grid gap-1 sm:grid-cols-2">
                                        {uncategorized.map((item) => {
                                          const cadence = resolveNasdaqCadence(item);
                                          const unit = resolveNasdaqUnitLabel(item);
                                          return (
                                            <div key={`${nasdaqWidget.id}-other-${item.id}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                              <div className="flex items-center justify-between gap-1">
                                                <p className="text-[11px] text-foreground/85 line-clamp-1">{resolveNasdaqLabel(item)}</p>
                                                <div className="flex items-center gap-1">
                                                  <MetricChip label={unit.unit} variant="unit" tone={unit.unknown ? "muted" : "neutral"} />
                                                  {cadence !== "unknown" ? <MetricChip label={cadence} variant="type" tone="muted" /> : null}
                                                </div>
                                              </div>
                                              {debugEnabled ? <p className="text-[9px] text-foreground/55 mt-0.5">{item.dataset}</p> : null}
                                              <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                                {formatMetricValue({ kind: "index", value: item.nativeValueCurrent, unit: unit.unit })}
                                              </p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                            <div className="flex flex-wrap items-center gap-1">
                              {nasdaqWidget.summary?.coverage ? <MetricChip label={`coverage ${nasdaqWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {nasdaqWidget.summary?.datasetStatuses?.some((entry) => entry.status === "forbidden")
                                ? <MetricChip label="premium series denied" variant="type" tone="muted" />
                                : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={nasdaqWidget.status}
                              statusClassName={grainStatusClass(nasdaqWidget.status)}
                              sourceName={nasdaqWidget.sourceName}
                              sourceUrl={nasdaqWidget.sourceUrl}
                              updatedLabel={nasdaqWidget.updatedAt ? formatRelative(nasdaqWidget.updatedAt) : nasdaqWidget.timeframe}
                              fallbackReason={nasdaqWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("NASDAQ_DATA_LINK_SNAPSHOT") ? "Nasdaq Data Link Snapshot" : "Nasdaq Data Link Snapshot (not configured)"}
                            subtitle="Macro/gov datasets (FRED + optional CHRIS)"
                          />
                        </div>
                      )}

                      {usdaGtrWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{usdaGtrWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(usdaGtrWidget.status)}`}>{usdaGtrWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{usdaGtrWidget.subtitle || "USDA grain transportation proxies"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(usdaGtrWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1 sm:grid-cols-2">
                              {usdaGtrWidget.items.slice(0, 4).map((item, idx) => (
                                <div key={`${usdaGtrWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{item.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={item.metric} variant="type" tone="muted" />
                                      <MetricChip label={item.unit} variant="unit" tone="neutral" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "index", value: item.current, unit: item.unit })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">
                                    {formatChangeWithUnit({
                                      change: item.changeAbs,
                                      unit: item.unit,
                                      pct: item.changePct,
                                    })}
                                  </p>
                                  <DynamicMiniTrend
                                    series={item.series || []}
                                    change={item.changeAbs}
                                    changePct={item.changePct}
                                    status={usdaGtrWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={usdaGtrWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: usdaGtrWidget.status,
                                      sourceName: usdaGtrWidget.sourceName,
                                      fallbackReason: usdaGtrWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!usdaGtrWidget.items.length ? (
                                <p className="text-[11px] text-foreground/68">No USDA GTR logistics signals mapped in current cycle.</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {usdaGtrWidget.summary?.coverage ? <MetricChip label={`coverage ${usdaGtrWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {usdaGtrWidget.summary?.cadence ? <MetricChip label={`cadence ${usdaGtrWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                              {debugEnabled && usdaGtrWidget.debug?.rowsParsed != null ? (
                                <MetricChip label={`rows ${usdaGtrWidget.debug.rowsParsed}`} variant="provider" tone="muted" />
                              ) : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={usdaGtrWidget.status}
                              statusClassName={grainStatusClass(usdaGtrWidget.status)}
                              sourceName={usdaGtrWidget.sourceName}
                              sourceUrl={usdaGtrWidget.sourceUrl}
                              updatedLabel={usdaGtrWidget.updatedAt ? formatRelative(usdaGtrWidget.updatedAt) : usdaGtrWidget.timeframe}
                              fallbackReason={usdaGtrWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("USDA_GTR_LOGISTICS_SNAPSHOT") ? "US Logistics (USDA GTR)" : "US Logistics (USDA GTR) (not configured)"}
                            subtitle="Open logistics proxies: barge / rail / fuel"
                          />
                        </div>
                      )}

                      {canadaRailWidget ? (
                        <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-sm">{canadaRailWidget.title}</CardTitle>
                              <Badge className={`text-[10px] ${grainStatusClass(canadaRailWidget.status)}`}>{canadaRailWidget.status}</Badge>
                            </div>
                            <CardDescription className="text-foreground/68">{canadaRailWidget.subtitle || "Canada weekly grain rail performance"}</CardDescription>
                            <div className="flex items-center gap-1">
                              <MetricChip label={territoryChipLabel(canadaRailWidget)} variant="unit" tone="neutral" />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1.5">
                            <div className="grid gap-1 sm:grid-cols-2">
                              {canadaRailWidget.items.slice(0, 4).map((item, idx) => (
                                <div key={`${canadaRailWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[11px] text-foreground/85 line-clamp-1">{item.label}</p>
                                    <div className="flex items-center gap-1">
                                      <MetricChip label={item.metric} variant="type" tone="muted" />
                                      <MetricChip label={item.unit} variant="unit" tone="neutral" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                                    {formatMetricValue({ kind: "index", value: item.current, unit: item.unit })}
                                  </p>
                                  <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: item.changeAbs, unit: item.unit, pct: item.changePct })}</p>
                                  <DynamicMiniTrend
                                    series={item.series || []}
                                    change={item.changeAbs}
                                    changePct={item.changePct}
                                    status={canadaRailWidget.status}
                                    section="expansion"
                                    cardKind="row"
                                    sourceName={canadaRailWidget.sourceName}
                                    trustedSeries={isTrustworthySeriesSource({
                                      status: canadaRailWidget.status,
                                      sourceName: canadaRailWidget.sourceName,
                                      fallbackReason: canadaRailWidget.fallbackReason,
                                    })}
                                    debugEnabled={debugEnabled}
                                  />
                                </div>
                              ))}
                              {!canadaRailWidget.items.length ? <p className="text-[11px] text-foreground/68">No Canada rail metrics mapped in current cycle.</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {canadaRailWidget.summary?.coverage ? <MetricChip label={`coverage ${canadaRailWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                              {canadaRailWidget.summary?.cadence ? <MetricChip label={`cadence ${canadaRailWidget.summary.cadence}`} variant="type" tone="muted" /> : null}
                            </div>
                            <StatusSourceStrip
                              compact
                              status={canadaRailWidget.status}
                              statusClassName={grainStatusClass(canadaRailWidget.status)}
                              sourceName={canadaRailWidget.sourceName}
                              sourceUrl={canadaRailWidget.sourceUrl}
                              updatedLabel={canadaRailWidget.updatedAt ? formatRelative(canadaRailWidget.updatedAt) : canadaRailWidget.timeframe}
                              fallbackReason={canadaRailWidget.fallbackReason}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="xl:col-span-6">
                          <GrainExpansionFallbackCard
                            title={grainDataOrder.includes("CANADA_GRAIN_RAIL_PERFORMANCE") ? "Canada Grain Rail" : "Canada Grain Rail (not configured)"}
                            subtitle="Official weekly rail performance indicators"
                          />
                        </div>
                      )}
                    </>
                  );
                })()}
                </div>
              </div>
            )}
          </div>
          ) : null}

          {!isSectionHidden("fundamentals-outlook") ? (
          <div id="fundamentals-outlook" className="scroll-mt-24 mt-3 space-y-2">
            <div className="rounded-3xl border border-black/15 bg-card/80 p-2.5 shadow-sm dark:border-white/12">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/55">Fundamentals & Outlook</p>
                  <h2 className="text-lg font-semibold text-foreground">Balances, outlooks, and structural benchmarks</h2>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <MetricChip label="slow cadence" variant="type" tone="muted" />
                  <MetricChip label="context layer" variant="provider" tone="neutral" />
                  <SectionHideButton onClick={() => toggleSectionHidden("fundamentals-outlook")} />
                </div>
              </div>
              <div className="grid items-start gap-2.5 xl:grid-cols-12">
                {usdaPsdWidget ? (
                  <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{usdaPsdWidget.title}</CardTitle>
                        <Badge className={`text-[10px] ${grainStatusClass(usdaPsdWidget.status)}`}>{usdaPsdWidget.status}</Badge>
                      </div>
                      <CardDescription className="text-foreground/68">{usdaPsdWidget.subtitle || "World supply / demand balances"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <div className="grid gap-1 sm:grid-cols-2">
                        {usdaPsdWidget.rows.slice(0, 4).map((row, idx) => (
                          <div key={`${usdaPsdWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                              <div className="flex items-center gap-1">
                                <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                <MetricChip label={row.cadence} variant="type" tone="muted" />
                              </div>
                            </div>
                            <p className="mt-0.5 text-[12px] font-semibold text-foreground">{formatMetricValue({ kind: "index", value: row.current, unit: row.unit })}</p>
                            <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}</p>
                            <DynamicMiniTrend
                              series={row.series || []}
                              change={row.changeAbs}
                              changePct={row.changePct}
                              status={usdaPsdWidget.status}
                              section="expansion"
                              cardKind="row"
                              sourceName={usdaPsdWidget.sourceName}
                              trustedSeries={isTrustworthySeriesSource({ status: usdaPsdWidget.status, sourceName: usdaPsdWidget.sourceName, fallbackReason: usdaPsdWidget.fallbackReason })}
                              debugEnabled={debugEnabled}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {usdaPsdWidget.summary?.coverage ? <MetricChip label={`coverage ${usdaPsdWidget.summary.coverage}`} variant="provider" tone="neutral" /> : null}
                      </div>
                      <StatusSourceStrip compact status={usdaPsdWidget.status} statusClassName={grainStatusClass(usdaPsdWidget.status)} sourceName={usdaPsdWidget.sourceName} sourceUrl={usdaPsdWidget.sourceUrl} updatedLabel={usdaPsdWidget.updatedAt ? formatRelative(usdaPsdWidget.updatedAt) : usdaPsdWidget.timeframe} fallbackReason={usdaPsdWidget.fallbackReason} />
                    </CardContent>
                  </Card>
                ) : <div className="xl:col-span-6"><GrainExpansionFallbackCard title="USDA PSD Balances" subtitle="World balance sheet / marketing year" /></div>}

                {imfWidget ? (
                  <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{imfWidget.title}</CardTitle>
                        <Badge className={`text-[10px] ${grainStatusClass(imfWidget.status)}`}>{imfWidget.status}</Badge>
                      </div>
                      <CardDescription className="text-foreground/68">{imfWidget.subtitle || "Monthly structural benchmarks"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <div className="grid gap-1 sm:grid-cols-2">
                        {imfWidget.rows.slice(0, 4).map((row, idx) => (
                          <div key={`${imfWidget.id}-${idx}`} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] text-foreground/85 line-clamp-1">{row.label}</p>
                              <div className="flex items-center gap-1">
                                <MetricChip label={row.unit} variant="unit" tone="neutral" />
                                <MetricChip label={row.cadence} variant="type" tone="muted" />
                              </div>
                            </div>
                            <p className="mt-0.5 text-[12px] font-semibold text-foreground">{formatMetricValue({ kind: "index", value: row.current, unit: row.unit })}</p>
                            <p className="text-[10px] text-foreground/65">{formatChangeWithUnit({ change: row.changeAbs, unit: row.unit, pct: row.changePct })}</p>
                            <DynamicMiniTrend
                              series={row.series || []}
                              change={row.changeAbs}
                              changePct={row.changePct}
                              status={imfWidget.status}
                              section="expansion"
                              cardKind="row"
                              sourceName={imfWidget.sourceName}
                              trustedSeries={isTrustworthySeriesSource({ status: imfWidget.status, sourceName: imfWidget.sourceName, fallbackReason: imfWidget.fallbackReason })}
                              debugEnabled={debugEnabled}
                            />
                          </div>
                        ))}
                      </div>
                      <StatusSourceStrip compact status={imfWidget.status} statusClassName={grainStatusClass(imfWidget.status)} sourceName={imfWidget.sourceName} sourceUrl={imfWidget.sourceUrl} updatedLabel={imfWidget.updatedAt ? formatRelative(imfWidget.updatedAt) : imfWidget.timeframe} fallbackReason={imfWidget.fallbackReason} />
                    </CardContent>
                  </Card>
                ) : <div className="xl:col-span-6"><GrainExpansionFallbackCard title="IMF Commodity Benchmarks" subtitle="Monthly structural benchmark layer" /></div>}

                {amisWidget ? (
                  <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{amisWidget.title}</CardTitle>
                        <Badge className={`text-[10px] ${grainStatusClass(amisWidget.status)}`}>{amisWidget.status}</Badge>
                      </div>
                      <CardDescription className="text-foreground/68">{amisWidget.subtitle || "Release-based global balance context"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <div className="grid gap-1 sm:grid-cols-2">
                        {amisWidget.items.slice(0, 4).map((item) => (
                          <a key={item.id} href={item.sourceUrl || amisWidget.sourceUrl} target="_blank" rel="noreferrer" className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5 transition hover:border-primary/35">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] text-foreground/85 line-clamp-1">{item.label}</p>
                              <MetricChip label={item.cadence} variant="type" tone="muted" />
                            </div>
                            <p className="mt-0.5 text-[12px] font-semibold text-foreground">{item.statusLabel || "Latest release available"}</p>
                            <p className="text-[10px] text-foreground/65">{item.releaseDate ? formatRelative(item.releaseDate) : amisWidget.summary?.releaseDate || "release-based"}</p>
                          </a>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {amisWidget.summary?.releaseDate ? <MetricChip label={`release ${formatRelative(amisWidget.summary.releaseDate)}`} variant="provider" tone="neutral" /> : null}
                      </div>
                      <StatusSourceStrip compact status={amisWidget.status} statusClassName={grainStatusClass(amisWidget.status)} sourceName={amisWidget.sourceName} sourceUrl={amisWidget.sourceUrl} updatedLabel={amisWidget.updatedAt ? formatRelative(amisWidget.updatedAt) : amisWidget.timeframe} fallbackReason={amisWidget.fallbackReason} />
                    </CardContent>
                  </Card>
                ) : <div className="xl:col-span-6"><GrainExpansionFallbackCard title="AMIS Global Balance" subtitle="Release-based monitor / outlook layer" /></div>}

                {oecdWidget ? (
                  <Card className="xl:col-span-6 h-auto self-start border-black/70 dark:border-white/35 bg-gradient-to-b from-card to-muted/20 text-foreground shadow-sm">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{oecdWidget.title}</CardTitle>
                        <Badge className={`text-[10px] ${grainStatusClass(oecdWidget.status)}`}>{oecdWidget.status}</Badge>
                      </div>
                      <CardDescription className="text-foreground/68">{oecdWidget.subtitle || "Forecast / annual outlook"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <div className="grid gap-1 sm:grid-cols-2">
                        {oecdWidget.items.slice(0, 4).map((item) => (
                          <div key={item.id} className="rounded border border-black/50 dark:border-white/20 bg-background/45 p-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] text-foreground/85 line-clamp-1">{item.label}</p>
                              <div className="flex items-center gap-1">
                                <MetricChip label={item.unit} variant="unit" tone="neutral" />
                                <MetricChip label={`to ${item.horizon}`} variant="type" tone="muted" />
                              </div>
                            </div>
                            <p className="mt-0.5 text-[12px] font-semibold text-foreground">{formatMetricValue({ kind: "index", value: item.projectedValue, unit: item.unit })}</p>
                            <p className="text-[10px] text-foreground/65">{item.confidence} confidence outlook</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {oecdWidget.summary?.horizon ? <MetricChip label={`horizon ${oecdWidget.summary.horizon}`} variant="provider" tone="neutral" /> : null}
                        <MetricChip label="forecast" variant="type" tone="muted" />
                      </div>
                      <StatusSourceStrip compact status={oecdWidget.status} statusClassName={grainStatusClass(oecdWidget.status)} sourceName={oecdWidget.sourceName} sourceUrl={oecdWidget.sourceUrl} updatedLabel={oecdWidget.updatedAt ? formatRelative(oecdWidget.updatedAt) : oecdWidget.timeframe} fallbackReason={oecdWidget.fallbackReason} />
                    </CardContent>
                  </Card>
                ) : <div className="xl:col-span-6"><GrainExpansionFallbackCard title="OECD Agricultural Outlook" subtitle="Forecast / projection layer" /></div>}
              </div>
            </div>
          </div>
          ) : null}

          {!isSectionHidden("top-signals") ? (
          <div id="top-signals" className="scroll-mt-24 grid items-start gap-2.5 xl:grid-cols-12">
            <div className="xl:col-span-12 flex justify-end">
              <SectionHideButton onClick={() => toggleSectionHidden("top-signals")} />
            </div>
            <Card className="xl:col-span-5 border-black/65 dark:border-white/35 bg-gradient-to-br from-red-100/55 via-card to-muted/25 dark:from-red-900/18 dark:via-card dark:to-muted/25 text-foreground dark:text-slate-100 shadow-sm transition-all duration-300 hover:border-red-400/45 hover:shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-400" />
                  <CardTitle className="text-base">Black Sea Watch</CardTitle>
                </div>
                <CardDescription className="text-foreground/70 dark:text-slate-400">Live corridor risk context for logistics, policy and weather</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5 rounded-md border border-black/70 dark:border-white/30 bg-muted/60 dark:bg-slate-950/55 p-1.5 text-[10px]">
                  <div>
                    <p className="text-foreground/65 dark:text-slate-400">Activity</p>
                    <p className="font-semibold text-foreground dark:text-white">
                      {blackSeaSignals.filter((item) => inLastHours(item, 24)).length}
                      <span className="ml-1 text-[9px] font-medium text-foreground/65">signals</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground/65 dark:text-slate-400">High impact</p>
                    <p className="font-semibold text-red-300">
                      {blackSeaSignals.filter((item) => inLastHours(item, 24) && classifyImpact(item) === "High").length}
                      <span className="ml-1 text-[9px] font-medium text-foreground/65">signals</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground/65 dark:text-slate-400">7d total</p>
                    <p className="font-semibold text-amber-300">
                      {blackSeaSignals.filter((item) => inLastHours(item, 24 * 7)).length}
                      <span className="ml-1 text-[9px] font-medium text-foreground/65">signals</span>
                    </p>
                  </div>
                </div>
                {blackSeaRisks.map((item) => (
                  <a key={`bs-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-black/70 dark:border-white/30 bg-muted/55 dark:bg-slate-900/80 p-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/35 hover:shadow-md">
                    <p className="line-clamp-2 text-xs font-medium text-foreground dark:text-slate-100">{item.title}</p>
                    <p className="mt-1 text-[10px] text-foreground/68 dark:text-slate-400">{classifySignalType(item)} • {formatRelative(item.published_at)}</p>
                  </a>
                ))}
              </CardContent>
            </Card>

            <div className="xl:col-span-7 grid auto-rows-min items-start gap-2.5 sm:grid-cols-2">
              {compactWidgets.map((widget) => (
                <CompactWidgetCard key={widget.id} widget={widget} />
              ))}
            </div>
          </div>
          ) : null}

          <div className="grid items-start gap-2.5 xl:grid-cols-12">
            <Card className="xl:col-span-6 border-black/65 dark:border-white/35 bg-gradient-to-b from-card to-muted/25 text-foreground dark:text-slate-100 shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <CardTitle className="text-base">Top Signals (Priority)</CardTitle>
                </div>
                <CardDescription className="text-foreground/70 dark:text-slate-400">Top three decision-relevant signals</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {prioritySignals.map((item, index) => (
                  <SignalCard key={item.id} item={item} rank={index} />
                ))}
              </CardContent>
            </Card>

            <Card className="xl:col-span-3 border-black/65 dark:border-white/35 bg-gradient-to-b from-card to-muted/25 text-foreground dark:text-slate-100 shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-md">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Market Narrative (24h)</CardTitle>
                <CardDescription className="text-foreground/70 dark:text-slate-400">Rule-based summary from active signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge className={`${marketNarrative.status === "Elevated" ? "border-red-500/45 bg-red-500/15 text-red-900 dark:text-red-100" : marketNarrative.status === "Rising" ? "border-amber-500/45 bg-amber-500/15 text-amber-900 dark:text-amber-100" : "border-blue-500/45 bg-blue-500/15 text-blue-900 dark:text-blue-100"} text-[10px] uppercase tracking-wide`}>
                  {marketNarrative.status}
                </Badge>
                <p className="text-sm leading-6 text-foreground/86 dark:text-slate-200">{marketNarrative.line}</p>
              </CardContent>
            </Card>

            <div className="xl:col-span-3 grid gap-2">
              {logisticsIndicatorsQuery.data?.enabled ? (
                (logisticsIndicatorsQuery.data?.widgets || []).slice(0, 2).map((indicator) => (
                  <Card key={`mini-${indicator.id}`} className="border-black/60 dark:border-white/30 bg-gradient-to-b from-card to-muted/22 text-foreground dark:text-slate-100 shadow-sm">
                    <CardContent className="space-y-1 pt-2.5 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground dark:text-slate-200">{indicator.title}</p>
                        <div className="flex items-center gap-1">
                          <MetricChip label="SIGNAL" variant="type" tone="muted" />
                          <MetricChip label={metricUnitChip(indicator.unit)} variant="unit" tone="neutral" />
                        </div>
                      </div>
                      <div className="mt-1 flex items-end justify-between">
                        <p className="text-lg font-bold text-foreground dark:text-white">
                          {indicator.valueCurrent == null ? "n/a" : formatNumber(indicator.valueCurrent)}
                          <span className="ml-1 text-[10px] font-medium text-foreground/65">{metricUnitChip(indicator.unit)}</span>
                        </p>
                        <p className="text-[10px] text-foreground/68 dark:text-slate-400">
                          {indicator.valueChange != null ? formatChangeWithUnit({ change: indicator.valueChange, unit: indicator.unit }) : "no delta"}
                        </p>
                      </div>
                      <IntensityBar
                        compact
                        value={trendIntensity(indicator.valueChange, indicator.valueChangePct)}
                        direction={trendDirection(indicator.valueChange, indicator.valueChangePct)}
                      />
                      <DynamicMiniTrend
                        series={indicator.series}
                        change={indicator.valueChange}
                        changePct={indicator.valueChangePct}
                        status={indicator.status}
                        section="context"
                        cardKind="signal"
                      />
                      <StatusSourceStrip
                        compact
                        status={indicatorStatusLabel(indicator.status)}
                        statusClassName={indicatorStatusClass(indicator.status)}
                        sourceName={indicator.sourceName}
                        sourceUrl={indicator.sourceUrl}
                        updatedLabel={indicator.updatedAt ? formatRelative(indicator.updatedAt) : indicator.timeframe}
                        fallbackReason={indicator.fallbackReason}
                      />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100">
                  <CardContent className="pt-4 text-xs text-foreground/72 dark:text-slate-400">Logistics indicators disabled.</CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="grid gap-2.5 xl:grid-cols-12">
            <Card className="xl:col-span-5 border-black/65 dark:border-white/35 bg-gradient-to-b from-card to-muted/25 text-foreground dark:text-slate-100 shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-md">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Market Pulse (Secondary)</CardTitle>
                <CardDescription className="text-foreground/70 dark:text-slate-400">24h directional intensity by crop</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {pulseByCrop.map((entry) => (
                  <div key={entry.crop} className="rounded-lg border border-black/70 dark:border-white/30 bg-muted/55 dark:bg-slate-900/80 p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80 dark:text-slate-300">{asLabel(entry.crop)}</p>
                        <MetricChip label="SIGNAL" variant="type" tone="muted" />
                      </div>
                      {entry.direction === "up" ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : entry.direction === "down" ? (
                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-foreground/65 dark:text-slate-400" />
                      )}
                    </div>
                    <p className="mt-1 text-lg font-semibold text-foreground dark:text-white">
                      {entry.now24h}
                      <span className="ml-1 text-[10px] font-medium text-foreground/65">signals</span>
                    </p>
                    <IntensityBar
                      compact
                      className="mt-1"
                      value={Math.min(100, Math.max(10, entry.now24h * 8))}
                      direction={entry.direction === "up" ? "up" : entry.direction === "down" ? "down" : "flat"}
                    />
                    <p className="text-[10px] text-foreground/65 dark:text-slate-400">24h signals • total {entry.total} signals</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="xl:col-span-5 border-black/65 dark:border-white/35 bg-gradient-to-b from-card to-muted/25 text-foreground dark:text-slate-100 shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Cropto UA Indices (Secondary)</CardTitle>
                  <Badge className="border-primary/40 bg-primary/15 text-foreground dark:text-primary-foreground">Internal</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {!indicesQuery.data?.enabled ? (
                  <p className="text-sm text-foreground/72 dark:text-slate-400">Coming soon</p>
                ) : indicesQuery.data?.items?.length ? (
                  indicesQuery.data.items.slice(0, 6).map((item) => (
                    <div key={item.slug} className="rounded-lg border border-black/70 dark:border-primary/25 bg-muted/55 dark:bg-slate-900/82 p-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-foreground dark:text-slate-100 line-clamp-1">{item.name}</p>
                        <MetricChip label="PRICE" variant="type" tone="muted" />
                      </div>
                      <div className="mt-1 flex items-end justify-between">
                        <p className="text-lg font-bold text-foreground dark:text-white">
                          {formatPriceWithUnit(item.value, (item as any).unit || "USD/t")}
                        </p>
                        <p className={`text-[10px] font-semibold ${item.change != null && item.change >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                          {item.change != null ? formatChangeWithUnit({ change: item.change, unit: (item as any).unit || "USD/t" }) : "n/a"}
                        </p>
                      </div>
                      <IntensityBar
                        compact
                        className="mt-1"
                        value={trendIntensity(item.change)}
                        direction={trendDirection(item.change)}
                      />
                      <StatusSourceStrip
                        compact
                        status="REFRESH"
                        statusClassName={grainStatusClass("REFRESH")}
                        sourceName={item.source}
                        updatedLabel={item.updatedAt ? formatRelative(item.updatedAt) : undefined}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-foreground/72 dark:text-slate-400">No index snapshots available yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2 border-black/60 dark:border-white/30 bg-gradient-to-b from-card to-muted/22 text-foreground dark:text-slate-100 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Macro / FX</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {fxQuery.data?.mode === "live" && fxQuery.data.rates.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1">
                    {fxQuery.data.rates.slice(0, 4).map((rate) => (
                      <div key={rate.currency} className="rounded-md border border-black/70 dark:border-white/30 bg-muted/55 dark:bg-slate-900/75 p-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[10px] text-foreground/65 dark:text-slate-400">{rate.currency}/USD</p>
                          <MetricChip label="FX" variant="type" tone="muted" />
                        </div>
                        <p className="text-sm font-semibold text-foreground dark:text-white">
                          {formatFxRate(rate.currency, "USD", rate.usdPerUnit)}
                          <span className="ml-1 text-[10px] font-medium text-foreground/65">rate</span>
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/72 dark:text-slate-400">Coming soon</p>
                )}
                <StatusSourceStrip
                  compact
                  status={fxQuery.data?.mode === "live" ? "REFRESH" : "OFFLINE"}
                  statusClassName={grainStatusClass(fxQuery.data?.mode === "live" ? "REFRESH" : "OFFLINE")}
                  sourceName={fxQuery.data?.source || "Macro FX snapshot"}
                  updatedLabel={fxQuery.data?.asOf ? formatRelative(fxQuery.data.asOf) : undefined}
                  fallbackReason={fxQuery.data?.mode === "live" ? undefined : fxQuery.data?.message}
                />
              </CardContent>
            </Card>
          </div>

          {!isSectionHidden("logistics-indicators") ? (
          <div id="logistics-indicators" className="scroll-mt-24 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground/82 dark:text-slate-300">Freight & Logistics Indicators</h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-foreground/65 dark:text-slate-500">
                  {logisticsIndicatorsQuery.data?.enabled ? "Demo-grade, fallback-first" : "Disabled"}
                </span>
                <SectionHideButton onClick={() => toggleSectionHidden("logistics-indicators")} />
              </div>
            </div>
            {!logisticsIndicatorsQuery.data?.enabled ? (
              <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100">
                <CardContent className="pt-6 text-sm text-foreground/72 dark:text-slate-400">
                  Indicators are disabled by feature flag.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {(logisticsIndicatorsQuery.data?.widgets || []).map((indicator) => (
                  <IndicatorCard key={indicator.id} indicator={indicator} />
                ))}
              </div>
            )}
          </div>
          ) : null}

          {!isSectionHidden("signal-charts") ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <SectionHideButton onClick={() => toggleSectionHidden("signal-charts")} />
            </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100 shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Signal Volume by Crop</CardTitle>
                  <span className="text-[10px] text-foreground/65 dark:text-slate-400">{chartWindow}</span>
                </div>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cropVolumeData}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#9AA33A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-4 pb-3 text-[10px] text-foreground/65 dark:text-slate-400">Legend: signal mentions tagged by crop.</div>
            </Card>

            <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100 shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Signal Volume by Topic</CardTitle>
                  <span className="text-[10px] text-foreground/65 dark:text-slate-400">{chartWindow}</span>
                </div>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topicVolumeData}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F2C94C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-4 pb-3 text-[10px] text-foreground/65 dark:text-slate-400">Legend: markets/trade/logistics/policy/weather/harvest tags.</div>
            </Card>

            <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100 shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Region Activity</CardTitle>
                  <span className="text-[10px] text-foreground/65 dark:text-slate-400">{chartWindow}</span>
                </div>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionVolumeData}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="count" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-4 pb-3 text-[10px] text-foreground/65 dark:text-slate-400">Legend: region-tagged signals by corridor.</div>
            </Card>

            <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100 shadow-md">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Mentions Trend ({chartWindow})</CardTitle>
                  <span className="text-[10px] text-foreground/65 dark:text-slate-400">{chartWindow}</span>
                </div>
              </CardHeader>
              <CardContent className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mentionsTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                    <YAxis hide />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#9AA33A" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-4 pb-3 text-[10px] text-foreground/65 dark:text-slate-400">Legend: total relevant mentions over recent days.</div>
            </Card>
          </div>
          </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Micro-widget range</p>
            <Button size="sm" variant={chartWindow === "24h" ? "default" : "outline"} className="h-7 px-2.5 text-xs border-black/70 dark:border-white/30 text-foreground dark:text-slate-200" onClick={() => setChartWindow("24h")}>
              24h
            </Button>
            <Button size="sm" variant={chartWindow === "7d" ? "default" : "outline"} className="h-7 px-2.5 text-xs border-black/70 dark:border-white/30 text-foreground dark:text-slate-200" onClick={() => setChartWindow("7d")}>
              7d
            </Button>
          </div>

          {!isSectionHidden("signal-filters") ? (
          <Card className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100 shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">Filters</CardTitle>
                <SectionHideButton onClick={() => toggleSectionHidden("signal-filters")} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-5">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Crop</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CROPS.map((item) => (
                      <Button key={item} size="sm" variant={crop === item ? "default" : "outline"} onClick={() => setCrop(item)} className="h-7 px-2.5 text-xs capitalize border-black/70 dark:border-white/30 text-foreground dark:text-slate-200">
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Topic</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TOPICS.map((item) => (
                      <Button key={item} size="sm" variant={topic === item ? "default" : "outline"} onClick={() => setTopic(item)} className="h-7 px-2.5 text-xs capitalize border-black/70 dark:border-white/30 text-foreground dark:text-slate-200">
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Region</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REGIONS.map((item) => (
                      <Button key={item} size="sm" variant={region === item ? "default" : "outline"} onClick={() => setRegion(item)} className="h-7 px-2.5 text-xs capitalize border-black/70 dark:border-white/30 text-foreground dark:text-slate-200">
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Time</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={time === "24h" ? "default" : "outline"} onClick={() => setTime("24h")} className="h-7 px-3 text-xs border-black/70 dark:border-white/30 text-foreground dark:text-slate-200">
                      24h
                    </Button>
                    <Button size="sm" variant={time === "7d" ? "default" : "outline"} onClick={() => setTime("7d")} className="h-7 px-3 text-xs border-black/70 dark:border-white/30 text-foreground dark:text-slate-200">
                      7d
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Search</p>
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keyword" className="h-8 border-black/70 dark:border-white/30 bg-background/80 dark:bg-slate-900/70 text-foreground dark:text-slate-100" />
                </div>
              </div>

              {debugEnabled ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wide text-foreground/70 dark:text-slate-400">Threshold</p>
                  {[2, 3, 4, 5].map((value) => (
                    <Button key={value} size="sm" variant={threshold === value ? "default" : "outline"} className="h-7 px-2.5 text-xs border-black/70 dark:border-white/30 text-foreground dark:text-slate-200" onClick={() => setThreshold(value)}>
                      {value}
                    </Button>
                  ))}
                  <p className="text-xs text-foreground/70 dark:text-slate-400">Current: {monitorQuery.data?.filters.threshold ?? threshold}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          ) : null}

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="text-lg font-semibold text-foreground dark:text-slate-100">Top Signals</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {topSignals.slice(0, 8).map((item, index) => (
                <SignalCard key={item.id} item={item} rank={index} />
              ))}
            </div>
          </div>

          {!isSectionHidden("terminal-panels") ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <SectionHideButton onClick={() => toggleSectionHidden("terminal-panels")} />
            </div>
          <div id="terminal-panels" className="scroll-mt-24 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {panels.map((panel) => {
              const expanded = expandedPanel === panel.id;
              const visibleItems = expanded ? panel.items.slice(0, 12) : panel.items.slice(0, 6);

              return (
                <Card key={panel.id} className="border-black/85 dark:border-white/85 bg-gradient-to-b from-card to-muted/35 text-foreground dark:text-slate-100 shadow-md transition-all duration-300 hover:border-primary/45 hover:shadow-lg">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{panel.title}</CardTitle>
                      <div className="flex items-center gap-1.5">
                        <Badge className="border-black/60 dark:border-white/40 bg-muted/65 dark:bg-white/5 text-[10px] text-foreground/75 dark:text-slate-300">{panel.items.length} items</Badge>
                        <Badge className="border-red-500/45 bg-red-500/15 text-[10px] text-red-900 dark:text-red-100">
                          {panel.items.filter((item) => classifyImpact(item) === "High").length} high
                        </Badge>
                        <Badge className="border-amber-500/45 bg-amber-500/15 text-[10px] text-amber-900 dark:text-amber-100">
                          {panel.items.filter((item) => inLastHours(item, 24)).length} new
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {visibleItems.map((item) => (
                      <a key={`${panel.id}-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-md border border-black/70 dark:border-white/30 bg-muted/55 dark:bg-slate-900/75 p-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md">
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                            classifyImpact(item) === "High" ? "bg-red-400" : classifyImpact(item) === "Medium" ? "bg-amber-300" : "bg-emerald-400"
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium text-foreground dark:text-slate-100">{item.title}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.topic_tags.slice(0, 2).map((tag) => (
                                <span key={`${item.id}-tag-${tag}`} className="rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/95 dark:text-primary-foreground/95">
                                  {asLabel(tag)}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1 text-[10px] text-foreground/68 dark:text-slate-400">{item.source_name} • {formatRelative(item.published_at)}</p>
                          </div>
                        </div>
                      </a>
                    ))}
                    {!panel.items.length ? <p className="text-xs text-foreground/70 dark:text-slate-400">No items in this module for current filters.</p> : null}
                    {panel.items.length > 6 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary hover:text-primary"
                        onClick={() => setExpandedPanel(expanded ? null : panel.id)}
                      >
                        {expanded ? "Collapse" : "View all"}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          </div>
          ) : null}

          {hiddenSections.length ? (
            <Card id="hidden-tray" className="border-black/75 dark:border-white/20 bg-muted/45 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Hidden Modules</CardTitle>
                    <CardDescription>Session-only hidden sections. Restore any module without touching source wiring.</CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 border-black/60 dark:border-white/20" onClick={() => setHiddenSectionIds([])}>
                    <Eye className="mr-2 h-4 w-4" />
                    Restore all
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {hiddenSections.map((section) => (
                  <Button
                    key={`hidden-${section.id}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-black/60 bg-background/80 dark:border-white/20"
                    onClick={() => toggleSectionHidden(section.id)}
                  >
                    <X className="mr-2 h-3.5 w-3.5" />
                    {section.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {debugEnabled ? (
            <Card className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-slate-100">
              <CardHeader>
                <CardTitle className="text-base">Debug Dashboard</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>Sources: {debugQuery.data?.sourcesEnabled ?? "-"} / {debugQuery.data?.sourcesTotal ?? "-"}</p>
                <p>Fetched (24h): {debugQuery.data?.itemsFetchedLast24h ?? "-"}</p>
                <p>After filtering: {debugQuery.data?.itemsAfterFiltering ?? "-"}</p>
                <p>Duplicates removed: {debugQuery.data?.duplicatesRemoved ?? "-"}</p>
                <div>
                  <p className="font-medium">Top sources:</p>
                  <ul className="list-disc pl-5">
                    {(debugQuery.data?.topSourcesByRelevantItems || []).slice(0, 5).map((row) => (
                      <li key={`top-${row.sourceId}`}>{row.sourceId}: {row.count}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Noisy sources:</p>
                  <ul className="list-disc pl-5">
                    {(debugQuery.data?.noisySources || []).slice(0, 5).map((row) => (
                      <li key={`noise-${row.sourceId}`}>{row.sourceId}: {row.count}</li>
                    ))}
                  </ul>
                </div>
                {debugQuery.data?.liveVisuals ? (
                  <div>
                    <p className="font-medium">Live visuals:</p>
                    <p>
                      {debugQuery.data.liveVisuals.enabled}/{debugQuery.data.liveVisuals.total} enabled • active {debugQuery.data.liveVisuals.active} • fallback {debugQuery.data.liveVisuals.fallback}
                    </p>
                  </div>
                ) : null}
                {debugQuery.data?.logisticsIndicators ? (
                  <div>
                    <p className="font-medium">Logistics indicators:</p>
                    <p>
                      enabled: {String(debugQuery.data.logisticsIndicators.enabled)} • refresh: {Math.round(debugQuery.data.logisticsIndicators.refreshMs / 1000)}s • cacheTTL: {Math.round(debugQuery.data.logisticsIndicators.cacheTtlMs / 1000)}s
                    </p>
                    <ul className="list-disc pl-5">
                      {debugQuery.data.logisticsIndicators.providers.map((provider) => (
                        <li key={`li-${provider.id}`}>
                          {provider.id}: {provider.status} • cacheAge {provider.cacheAgeSec ?? "-"}s • fallback {String(provider.fallbackMode)}
                          {provider.lastError ? ` • err: ${provider.lastError}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {debugQuery.data?.grainMarkets ? (
                  <div>
                    <p className="font-medium">Grain markets core:</p>
                    <p>
                      enabled: {String(debugQuery.data.grainMarkets.enabled)} • refresh: {Math.round(debugQuery.data.grainMarkets.refreshMs / 1000)}s • cacheTTL: {Math.round(debugQuery.data.grainMarkets.cacheTtlMs / 1000)}s
                    </p>
                    <p>
                      defaults: USD/t & °C • fx EURUSD: {debugQuery.data.grainMarkets.fxRateUsed?.toFixed(4) ?? "n/a"}
                    </p>
                    {debugQuery.data.grainMarkets.normalization ? (
                      <p>
                        normalized: {debugQuery.data.grainMarkets.normalization.normalizedCount} • native fallback: {debugQuery.data.grainMarkets.normalization.nativeFallbackCount}
                      </p>
                    ) : null}
                    <ul className="list-disc pl-5">
                      {debugQuery.data.grainMarkets.providers.map((provider) => (
                        <li key={`gm-${provider.providerId}`}>
                          {provider.providerId}: {provider.status} • cacheAge {provider.cacheAgeSec ?? "-"}s • fallback {String(provider.fallbackUsed)}
                          {provider.error ? ` • err: ${provider.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {debugQuery.data?.grainWidgets ? (
                  <div>
                    <p className="font-medium">Grain widgets expansion:</p>
                    <p>
                      enabled: {String(debugQuery.data.grainWidgets.enabled)} • refresh: {Math.round(debugQuery.data.grainWidgets.refreshMs / 1000)}s • cacheTTL: {Math.round(debugQuery.data.grainWidgets.cacheTtlMs / 1000)}s
                    </p>
                    {debugQuery.data.grainWidgets.normalization ? (
                      <p>
                        normalized: {debugQuery.data.grainWidgets.normalization.normalizedCount} • native fallback: {debugQuery.data.grainWidgets.normalization.nativeFallbackCount} • fx EURUSD: {debugQuery.data.grainWidgets.normalization.fxRateUsed?.toFixed(4) ?? "n/a"}
                      </p>
                    ) : null}
                    <ul className="list-disc pl-5">
                      {debugQuery.data.grainWidgets.providers.map((provider) => (
                        <li key={`gw-${provider.providerId}`}>
                          {provider.providerId}: {provider.status} • cacheAge {provider.cacheAgeSec ?? "-"}s • fallback {String(provider.fallbackUsed)}
                          {provider.error ? ` • err: ${provider.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
      <DeckEcosystemStrip />
      </main>
      <MonitorFooter hiddenCount={hiddenSections.length} />
      <WorldTimeDrawer />
    </div>
  );
}
