export type GrainMarketVenue = "CBOT" | "EURONEXT";
export type GrainMarketCommodityGroup = "Grains" | "Oilseeds";

export type GrainMarketInstrumentKey =
  | "CBOT_CORN"
  | "CBOT_WHEAT"
  | "CBOT_SOYBEANS"
  | "EURONEXT_MILLING_WHEAT"
  | "EURONEXT_CORN"
  | "EURONEXT_RAPESEED";

export type GrainMarketStatus =
  | "LIVE"
  | "REFRESH"
  | "DELAYED"
  | "INDICATIVE"
  | "FALLBACK"
  | "OFFLINE";

export type GrainMarketTimeframe = "1d" | "7d";
export type ComparisonType = "same-family" | "proxy";

export type RelativeMoveSignal =
  | "US outperforming"
  | "EU outperforming"
  | "Mixed"
  | "Flat"
  | "Unavailable";

export interface GrainMarketPoint {
  ts: string;
  value: number;
}

export interface GrainMarketInstrumentMeta {
  key: GrainMarketInstrumentKey;
  venue: GrainMarketVenue;
  displayName: string;
  shortName: string;
  commodityGroup: GrainMarketCommodityGroup;
  currency: string;
  unit?: string;
  sourceInstrumentId?: string;
  updateCadenceHint?: string;
}

export interface GrainMarketQuoteNormalized extends GrainMarketInstrumentMeta {
  status: GrainMarketStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  asOf?: string;
  timeframe: GrainMarketTimeframe;
  valueCurrent?: number;
  valuePrevious?: number;
  valueChange?: number;
  valueChangePct?: number;
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
  series?: GrainMarketPoint[];
  notes?: string[];
  fallbackReason?: string;
  providerId?: string;
  isCached?: boolean;
  cacheAgeSec?: number;
}

export interface GrainMarketWidgetItem {
  instrumentKey: GrainMarketInstrumentKey;
  venue: GrainMarketVenue;
  title: string;
  subtitle?: string;
  status: GrainMarketStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  asOf?: string;
  timeframe: GrainMarketTimeframe;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
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
  series?: GrainMarketPoint[];
  notes?: string[];
  fallbackReason?: string;
  venueBadge?: string;
  marketLabel?: string;
}

export interface GrainMarketComparisonWidget {
  id: "WHEAT_US_EU" | "CORN_US_EU" | "SOY_RAPE_PROXY";
  title: string;
  status: GrainMarketStatus;
  comparisonType: ComparisonType;
  leftInstrumentKey: GrainMarketInstrumentKey;
  rightInstrumentKey: GrainMarketInstrumentKey;
  leftLabel: string;
  rightLabel: string;
  spreadAbs?: number;
  spreadUnit?: string;
  spreadPct?: number;
  leftChangePct?: number;
  rightChangePct?: number;
  relativeMoveSignal: RelativeMoveSignal;
  trendLabel?: "Rising" | "Cooling" | "Stable" | "Mixed";
  series?: GrainMarketPoint[];
  note?: string;
  sourceAttribution?: string;
  updatedAt: string;
  notes?: string[];
  fallbackReason?: string;
}

export interface GrainMarketsWidgetsPayload {
  cbot: GrainMarketWidgetItem[];
  euronext: GrainMarketWidgetItem[];
  comparisons: GrainMarketComparisonWidget[];
}

export interface GrainMarketsMeta {
  generatedAt: string;
  partialFailure: boolean;
  cacheAgeSec?: number;
  timeframe: GrainMarketTimeframe;
  instrumentsRequested: GrainMarketInstrumentKey[];
  instrumentsReturned: GrainMarketInstrumentKey[];
  fxRateUsed?: number;
  normalizationCoverage?: {
    ok: number;
    partial: number;
    fxMissing: number;
    unavailable: number;
  };
  counts?: {
    total: number;
    live: number;
    delayed: number;
    indicative: number;
    fallback: number;
    offline: number;
  };
}

export interface GrainMarketsProviderDebug {
  providerId: string;
  providerType?: string;
  enabled: boolean;
  status: "ok" | "partial" | "error" | "disabled";
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  cacheHit?: boolean;
  cacheAgeSec?: number;
  instrumentsRequested?: GrainMarketInstrumentKey[];
  instrumentsReturned?: GrainMarketInstrumentKey[];
  fallbackUsed?: boolean;
  error?: string;
}

export interface GrainMarketsDebug {
  providers: GrainMarketsProviderDebug[];
  sourceErrors?: Array<{
    providerId: string;
    instrumentKey?: GrainMarketInstrumentKey;
    message: string;
  }>;
  fallbackUsed?: Partial<Record<GrainMarketInstrumentKey, boolean>>;
  symbolMapping?: Partial<Record<GrainMarketInstrumentKey, string>>;
  unavailableInstruments?: GrainMarketInstrumentKey[];
  normalization?: {
    defaults: {
      price: "USD/t";
      temperature: "C";
    };
    fxRateUsed?: number;
    perInstrument: Partial<
      Record<
        GrainMarketInstrumentKey,
        {
          normalizationStatus: "OK" | "PARTIAL" | "FX_MISSING" | "UNAVAILABLE";
          normalizationMethod?: string;
          fxRateUsed?: number;
        }
      >
    >;
    normalizedCount: number;
    nativeFallbackCount: number;
  };
}

export interface GrainMarketsResponse {
  widgets: GrainMarketsWidgetsPayload;
  meta: GrainMarketsMeta;
  debug?: GrainMarketsDebug;
}
