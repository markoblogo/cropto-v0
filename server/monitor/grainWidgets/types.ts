export type GrainWidgetStatus =
  | "LIVE"
  | "REFRESH"
  | "DELAYED"
  | "INDICATIVE"
  | "FALLBACK"
  | "OFFLINE";

export type GrainWidgetsTimeframe = "1d" | "7d";

export type GrainWidgetKind =
  | "US_CASH_BIDS"
  | "GLOBAL_SPOT_TABLE"
  | "CROP_PRICE_INDEX"
  | "CBOT_FUTURES_SNAPSHOT"
  | "CBOT_FUTURES_CURVE";

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

export type GrainWidget =
  | GrainWidgetUSCashBids
  | GrainWidgetGlobalSpotTable
  | GrainWidgetCropPriceIndex
  | GrainWidgetCbotFuturesSnapshot
  | GrainWidgetCbotFuturesCurve;

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
    normalizedRowsOk: number;
    normalizedRowsPartial: number;
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
  fallbackUsed?: boolean;
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
    errors?: string[];
  };
  unavailableWidgets?: GrainWidgetKind[];
}

export interface GrainWidgetsResponse {
  widgets: GrainWidgetsPayload;
  meta: GrainWidgetsMeta;
  debug?: GrainWidgetsDebug;
}
