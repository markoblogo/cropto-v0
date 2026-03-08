export type GrainWidgetStatus =
  | "LIVE"
  | "REFRESH"
  | "DELAYED"
  | "INDICATIVE"
  | "FALLBACK"
  | "OFFLINE";

export type GrainWidgetsTimeframe = "1d" | "7d";
export type GrainWidgetTerritoryScope = "GLOBAL" | "COUNTRY_FIXED" | "COUNTRY_MULTI";

export type GrainWidgetKind =
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
  | "USDA_GTR_LOGISTICS_SNAPSHOT"
  | "CANADA_GRAIN_RAIL_PERFORMANCE"
  | "FAOSTAT_PP_MULTI_COUNTRY"
  | "FPMA_MARKET_PRICES_MULTI_COUNTRY";

export type GrainMetricSemanticKind =
  | "price"
  | "index"
  | "composite"
  | "signal";

export type MacroAgriRenderMode =
  | "api_series"
  | "embed"
  | "fallback";

export type EmbedAvailabilityStatus =
  | "AVAILABLE"
  | "BLOCKED"
  | "DISABLED"
  | "UNAVAILABLE";

export type GrainPriceNormalizationStatus =
  | "OK"
  | "PARTIAL"
  | "FX_MISSING"
  | "UNAVAILABLE";

export type GrainPriceDisplayCurrency = "USD" | "EUR" | string;
export type GrainPriceDisplayUnit = "t" | "bu" | string;

export interface GrainWidgetPoint {
  ts: string;
  value: number;
}

export interface GrainWidgetPriceValue {
  nativeValueCurrent?: number;
  nativeValueChange?: number;
  nativeValueChangePct?: number;
  nativeCurrency?: GrainPriceDisplayCurrency;
  nativeUnit?: GrainPriceDisplayUnit | string;
  nativeLabel?: string;
  normalizedValueCurrent?: number;
  normalizedValueChange?: number;
  normalizedValueChangePct?: number;
  normalizedCurrency?: "USD";
  normalizedUnit?: "t";
  normalizationStatus: GrainPriceNormalizationStatus;
  normalizationMethod?: string;
  normalizationMeta?: {
    fxRateUsed?: number;
    bushelsPerTon?: number;
    cropFactor?: string;
    notes?: string[];
  };
}

export interface GrainWidgetBase {
  id: string;
  kind: GrainWidgetKind;
  title: string;
  subtitle?: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  asOf?: string;
  timeframe?: GrainWidgetsTimeframe;
  notes?: string[];
  fallbackReason?: string;
  territoryScope?: GrainWidgetTerritoryScope;
  territory?: {
    code: string;
    label: string;
  };
  supportedTerritories?: Array<{
    code: string;
    label: string;
  }>;
  territorySelector?: {
    paramName: "country";
    default: string;
    current: string;
    persistKey: string;
  };
}

export interface GrainWidgetTableCellPrice extends GrainWidgetPriceValue {
  series?: GrainWidgetPoint[];
}

export interface GrainWidgetTableRow {
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
  metricSemanticKind?: GrainMetricSemanticKind;
  territory?: {
    code: string;
    label: string;
  };
}

export interface GrainWidgetStatCard {
  id: string;
  label: string;
  value?: number;
  valueText?: string;
  delta?: number;
  deltaPct?: number;
  status?: GrainWidgetStatus;
  series?: GrainWidgetPoint[];
  notes?: string[];
}

export interface GrainWidgetUSCashBids extends GrainWidgetBase {
  kind: "US_CASH_BIDS";
  rows: GrainWidgetTableRow[];
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
}

export interface GrainWidgetGlobalSpotTable extends GrainWidgetBase {
  kind: "GLOBAL_SPOT_TABLE";
  rows: GrainWidgetTableRow[];
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
}

export interface GrainWidgetCropPriceIndex extends GrainWidgetBase {
  kind: "CROP_PRICE_INDEX";
  cards: GrainWidgetStatCard[];
  rows?: GrainWidgetTableRow[];
  weatherTieIn?: {
    available: boolean;
    label?: string;
    score?: number;
    status?: GrainWidgetStatus;
    notes?: string[];
  };
}

export interface GrainWidgetCbotFuturesSnapshot extends GrainWidgetBase {
  kind: "CBOT_FUTURES_SNAPSHOT";
  rows: GrainWidgetTableRow[];
  summary?: {
    contractsParsed?: number;
    parseMode?: "snapshot" | "curve-lite";
    notes?: string[];
  };
}

export interface GrainWidgetCbotFuturesCurveSeries {
  contractLabel: string;
  value?: GrainWidgetPriceValue;
  status?: GrainWidgetStatus;
  notes?: string[];
}

export interface GrainWidgetCbotFuturesCurve extends GrainWidgetBase {
  kind: "CBOT_FUTURES_CURVE";
  commodity: "Corn" | "Wheat" | "Soybeans";
  contracts: GrainWidgetCbotFuturesCurveSeries[];
  summary?: {
    curveShape?: "Contango" | "Backwardation" | "Flat" | "Mixed" | "Unavailable";
    parseMode?: "curve" | "curve-lite";
    notes?: string[];
  };
}

export interface GrainWidgetLivestockFeedRow extends GrainWidgetTableRow {
  metricSemanticKind?: GrainMetricSemanticKind;
  tieInCue?: {
    label?: "Supportive" | "Neutral" | "Soft" | "Mixed";
    score?: number;
    notes?: string[];
  };
}

export interface GrainWidgetLivestockFeedSummary {
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
}

export interface GrainWidgetLivestockFeedTieIn extends GrainWidgetBase {
  kind: "LIVESTOCK_FEED_TIEIN";
  rows: GrainWidgetLivestockFeedRow[];
  summary?: GrainWidgetLivestockFeedSummary;
  derivedFrom?: Array<{
    source: "grainMarkets" | "grainWidgets" | "external";
    key: string;
    label?: string;
  }>;
}

export interface GrainWidgetMacroAgriIndexItem {
  id: string;
  label: string;
  sublabel?: string;
  region?: string;
  metricSemanticKind: GrainMetricSemanticKind;
  status?: GrainWidgetStatus;
  price?: GrainWidgetPriceValue;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  unitLabel?: string;
  valueLabel?: string;
  series?: GrainWidgetPoint[];
  sourceName?: string;
  sourceAttribution?: string;
  updatedAt?: string;
  tags?: string[];
  notes?: string[];
}

export interface GrainWidgetMacroAgriEmbedConfig {
  enabled: boolean;
  status: EmbedAvailabilityStatus;
  providerName: string;
  title?: string;
  embedUrl?: string;
  externalUrl?: string;
  suggestedHeightPx?: number;
  aspectRatio?: string;
  notes?: string[];
}

export interface GrainWidgetMacroAgriIndicesSummary {
  itemCount: number;
  momentumLabel?: "Firm" | "Soft" | "Mixed" | "Flat" | "Unavailable";
  renderMode: MacroAgriRenderMode;
  modeReason?: string;
  metricCoverage?: {
    priceLikeItems: number;
    indexItems: number;
    compositeItems: number;
    signalItems: number;
  };
}

export interface GrainWidgetMacroAgriIndices extends GrainWidgetBase {
  kind: "MACRO_AGRI_INDICES";
  renderMode: MacroAgriRenderMode;
  items?: GrainWidgetMacroAgriIndexItem[];
  cards?: GrainWidgetStatCard[];
  embed?: GrainWidgetMacroAgriEmbedConfig;
  summary?: GrainWidgetMacroAgriIndicesSummary;
}

export interface GrainWidgetUsdaMarsReportItem {
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
}

export interface GrainWidgetUsdaMarsReports extends GrainWidgetBase {
  kind: "USDA_MARS_REPORTS";
  reports: GrainWidgetUsdaMarsReportItem[];
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
}

export interface GrainWidgetUsCashExportContextReportLink {
  id: string;
  title: string;
  publishedAt?: string;
  fileType?: "PDF" | "TXT" | "HTML" | "OTHER";
  regionTag?: string;
  typeTag?: string;
  url?: string;
}

export interface GrainWidgetUsCashExportContext extends GrainWidgetBase {
  kind: "US_CASH_EXPORT_CONTEXT";
  summary: {
    exportIndications: boolean;
    dailyBids: boolean;
    marketRates: boolean;
    reportsToday: number;
    regions: string[];
    cadenceHints?: string[];
  };
  topReports: GrainWidgetUsCashExportContextReportLink[];
}

export interface GrainWidgetUsdaMarsDailyMarketRatesTxtRow {
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
}

export interface GrainWidgetUsdaMarsDailyMarketRatesTxt extends GrainWidgetBase {
  kind: "USDA_MARS_DAILY_MARKET_RATES_TXT";
  report: {
    reportId: number;
    publishedAt?: string;
    fileName?: string;
    fileType: "txt";
    sourceUrl?: string;
  };
  rows: GrainWidgetUsdaMarsDailyMarketRatesTxtRow[];
  debug?: {
    linesFetched: number;
    linesMatched: number;
    parseMode: "strict";
    reportsFetched?: number;
    metadataSourceUrl?: string;
    downloadUrlUsed?: string;
    dailyReportFound?: boolean;
    matchedSections?: string[];
    warnings?: string[];
  };
}

export type AlphaVantageUnitConfidence = "CONFIRMED" | "ASSUMED" | "UNKNOWN";

export interface GrainWidgetAlphaVantageBenchmarkRow extends GrainWidgetTableRow {
  alphaFunction: string;
  unitConfidence: AlphaVantageUnitConfidence;
  allowNormalization: boolean;
  momChangePct?: number;
  yoyChangePct?: number;
}

export interface GrainWidgetAlphaVantageGrainBenchmarks extends GrainWidgetBase {
  kind: "ALPHAVANTAGE_GRAIN_BENCHMARKS";
  rows: GrainWidgetAlphaVantageBenchmarkRow[];
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "unknown";
    normalizedCoverage?: {
      ok: number;
      partial: number;
      fxMissing: number;
      unavailable: number;
    };
    byFunction?: Array<{
      fn: string;
      unitLabel: string;
      unitConfidence: AlphaVantageUnitConfidence;
      allowNormalization: boolean;
      seriesPoints: number;
      cacheHit?: boolean;
    }>;
  };
}

export interface GrainWidgetNasdaqDataLinkItem {
  id: string;
  dataset: string;
  label: string;
  nativeValueCurrent?: number;
  nativeUnit: string;
  changeAbs?: number;
  changePct?: number;
  series?: GrainWidgetPoint[];
  unitConfidence: AlphaVantageUnitConfidence;
  notes?: string[];
}

export interface GrainWidgetNasdaqDataLinkSnapshot extends GrainWidgetBase {
  kind: "NASDAQ_DATA_LINK_SNAPSHOT";
  items: GrainWidgetNasdaqDataLinkItem[];
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
}

export interface GrainWidgetEcOfficialPricesSnapshot extends GrainWidgetBase {
  kind: "EC_CEREALS_MULTI_COUNTRY" | "EC_OILSEEDS_MULTI_COUNTRY" | "USDA_NASS_PRODUCER_PRICES";
  rows: GrainWidgetTableRow[];
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "annual" | "unknown";
    selectedTerritory?: string;
    stageLabel?: string;
  };
  debug?: {
    sourceUrlUsed?: string;
    query?: string;
    productCodes?: string[];
    stageCodes?: string[];
    marketCodes?: string[];
    rowsParsed?: number;
    warnings?: string[];
  };
}

export interface GrainWidgetUsdaGtrLogisticsItem {
  metric: "BARGE" | "RAIL" | "OCEAN" | "FUEL" | "TRANSIT" | "OTHER";
  label: string;
  current: number;
  unit: string;
  changeAbs?: number;
  changePct?: number;
  series?: GrainWidgetPoint[];
  confidence: "HIGH" | "MED" | "LOW";
}

export interface GrainWidgetUsdaGtrLogisticsSnapshot extends GrainWidgetBase {
  kind: "USDA_GTR_LOGISTICS_SNAPSHOT";
  items: GrainWidgetUsdaGtrLogisticsItem[];
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "daily" | "weekly" | "monthly" | "unknown";
  };
  debug?: {
    sourceUrlUsed?: string;
    datasetUrlChosen?: string;
    rowsParsed?: number;
    columnsDetected?: string[];
    seriesPoints?: number;
    httpStatus?: number;
    finalUrl?: string;
    responseHeaders?: Record<string, string>;
    transportUsed?: "fetch" | "node_https_fallback";
    rangeRequestUsed?: boolean;
    parseWarnings?: string[];
  };
}

export interface GrainWidgetCanadaRailPerformanceItem {
  metric: "LOADED_CARS" | "FULFILLMENT" | "DELAY" | "MOVEMENT" | "OTHER";
  label: string;
  current: number;
  unit: string;
  changeAbs?: number;
  changePct?: number;
  series?: GrainWidgetPoint[];
  confidence: "HIGH" | "MED" | "LOW";
}

export interface GrainWidgetCanadaRailPerformance extends GrainWidgetBase {
  kind: "CANADA_GRAIN_RAIL_PERFORMANCE";
  items: GrainWidgetCanadaRailPerformanceItem[];
  summary?: {
    expectedCount: number;
    mappedCount: number;
    coverage?: string;
    cadence?: "weekly" | "monthly" | "unknown";
  };
  debug?: {
    sourceUrlUsed?: string;
    datasetUrlChosen?: string;
    rowsParsed?: number;
    columnsDetected?: string[];
    seriesPoints?: number;
    warnings?: string[];
  };
}

export interface GrainWidgetFaostatPpRow {
  crop: "WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER";
  label: string;
  current: number;
  unit: string;
  cadence: "monthly" | "annual";
  changeAbs?: number;
  changePct?: number;
  series?: GrainWidgetPoint[];
  confidence: "HIGH" | "MED" | "LOW";
  notes?: string[];
  territory?: {
    code: string;
    label: string;
  };
}

export interface GrainWidgetFaostatPpMultiCountry extends GrainWidgetBase {
  kind: "FAOSTAT_PP_MULTI_COUNTRY";
  rows: GrainWidgetFaostatPpRow[];
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
}

export interface GrainWidgetFpmaMarketPricesRow {
  crop: "WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER";
  label: string;
  current: number;
  unit: string;
  currency?: string;
  cadence: "monthly" | "weekly" | "annual" | "unknown";
  changeAbs?: number;
  changePct?: number;
  series?: GrainWidgetPoint[];
  confidence: "HIGH" | "MED" | "LOW";
  notes?: string[];
  territory?: {
    code: string;
    label: string;
  };
}

export interface GrainWidgetFpmaMarketPricesMultiCountry extends GrainWidgetBase {
  kind: "FPMA_MARKET_PRICES_MULTI_COUNTRY";
  selector?: {
    priceType?: {
      current: "RETAIL" | "WHOLESALE";
      options: Array<"RETAIL" | "WHOLESALE">;
    };
  };
  rows: GrainWidgetFpmaMarketPricesRow[];
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
    discoveryFetchedAt?: string;
    discoveryCacheHit?: boolean;
    discoveryEndpointsTried?: Array<{ name: string; url: string; ok: boolean; status?: number }>;
    query?: string;
    warnings?: string[];
  };
}

export type GrainWidget =
  | GrainWidgetUSCashBids
  | GrainWidgetGlobalSpotTable
  | GrainWidgetCropPriceIndex
  | GrainWidgetCbotFuturesSnapshot
  | GrainWidgetCbotFuturesCurve
  | GrainWidgetLivestockFeedTieIn
  | GrainWidgetMacroAgriIndices
  | GrainWidgetUsdaMarsReports
  | GrainWidgetUsCashExportContext
  | GrainWidgetUsdaMarsDailyMarketRatesTxt
  | GrainWidgetAlphaVantageGrainBenchmarks
  | GrainWidgetNasdaqDataLinkSnapshot
  | GrainWidgetEcOfficialPricesSnapshot
  | GrainWidgetUsdaGtrLogisticsSnapshot
  | GrainWidgetCanadaRailPerformance
  | GrainWidgetFaostatPpMultiCountry
  | GrainWidgetFpmaMarketPricesMultiCountry;

export interface GrainWidgetsPayload {
  byKind: Partial<Record<GrainWidgetKind, GrainWidget>>;
  order: GrainWidgetKind[];
}

export interface GrainWidgetsMeta {
  generatedAt: string;
  partialFailure: boolean;
  cacheAgeSec?: number;
  timeframe: GrainWidgetsTimeframe;
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
    normalizedPriceMetricsOk: number;
    normalizedPriceMetricsPartial: number;
    fxMissing: number;
    unavailable: number;
    fxRateUsed?: number;
  };
}

export interface GrainWidgetsProviderDebug {
  providerId: string;
  providerType?: string;
  enabled: boolean;
  status: "ok" | "partial" | "error" | "disabled";
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  cacheHit?: boolean;
  cacheAgeSec?: number;
  widgetsRequested?: GrainWidgetKind[];
  widgetsReturned?: GrainWidgetKind[];
  rowsReturned?: number;
  itemsReturned?: number;
  cardsReturned?: number;
  mappedCount?: number;
  expectedCount?: number;
  reportsFetched?: number;
  reportsScanned?: number;
  reportsMatchedInclude?: number;
  reportsExcluded?: number;
  reportsReturnedTop?: number;
  unitConfidenceByFunction?: Array<{
    fn: string;
    unitConfidence: AlphaVantageUnitConfidence;
    allowNormalization: boolean;
  }>;
  datasetStatuses?: Array<{
    dataset: string;
    status: "ok" | "error" | "forbidden" | "rate_limited" | "empty" | "parse_error";
    errorKind?: "DNS" | "TIMEOUT" | "HTTP_4XX" | "HTTP_5XX" | "PARSE" | "EMPTY" | "BLOCKED" | "RATE_LIMIT" | "UNKNOWN";
    sourceUrlUsed?: string;
    note?: string;
  }>;
  linesFetched?: number;
  linesMatched?: number;
  rowsParsed?: number;
  columnsDetected?: string[];
  seriesPoints?: number;
  httpStatus?: number;
  finalUrl?: string;
  responseHeaders?: Record<string, string>;
  transportUsed?: "fetch" | "node_https_fallback";
  rangeRequestUsed?: boolean;
  parseWarnings?: string[];
  areaCodes?: string[];
  itemCodes?: string[];
  commodityIdsUsed?: string[];
  elementCode?: string;
  elementLabel?: string;
  observationsByCrop?: Array<{ crop: string; count: number }>;
  countryQueryUsed?: string;
  selectedPriceType?: "RETAIL" | "WHOLESALE";
  discoveryFetchedAt?: string;
  discoveryCacheHit?: boolean;
  discoveryEndpointsTried?: Array<{ name: string; url: string; ok: boolean; status?: number }>;
  query?: string;
  downloadUrlUsed?: string;
  datasetUrlChosen?: string;
  parseMode?: "strict";
  topScoreMin?: number;
  topScoreMax?: number;
  cadence?: "daily" | "weekly" | "monthly" | "annual" | "unknown";
  errorKind?: "DNS" | "TIMEOUT" | "HTTP_4XX" | "HTTP_5XX" | "PARSE" | "EMPTY" | "BLOCKED" | "RATE_LIMIT" | "UNKNOWN";
  sourceUrlUsed?: string;
  coverage?: string;
  fallbackChain?: "real->cache->mock";
  fallbackUsed?: boolean;
  notes?: string[];
  error?: string;
}

export interface GrainWidgetsDebug {
  providers: GrainWidgetsProviderDebug[];
  sourceErrors?: Array<{
    providerId: string;
    widgetKind?: GrainWidgetKind;
    rowId?: string;
    message: string;
  }>;
  fallbackUsed?: Partial<Record<GrainWidgetKind, boolean>>;
  normalization?: {
    fxRateUsed?: number;
    rowsByStatus?: {
      OK: number;
      PARTIAL: number;
      FX_MISSING: number;
      UNAVAILABLE: number;
    };
    embed?: {
      blockedCount: number;
      disabledCount: number;
      unavailableCount: number;
    };
    errors?: string[];
  };
  fallbackChain?: "real->cache->mock";
  unavailableWidgets?: GrainWidgetKind[];
}

export interface GrainWidgetsResponse {
  widgets: GrainWidgetsPayload;
  meta: GrainWidgetsMeta;
  debug?: GrainWidgetsDebug;
}
