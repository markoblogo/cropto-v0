export type GrainWidgetStatus = "LIVE" | "DELAYED" | "INDICATIVE" | "FALLBACK" | "OFFLINE";
export type GrainVenue = "CBOT/CME" | "Euronext";

export type GrainInstrumentKey =
  | "corn"
  | "wheat"
  | "soy"
  | "milling_wheat"
  | "euronext_corn"
  | "rapeseed";

export type GrainSeriesPoint = {
  ts: string;
  value: number;
};

export type GrainInstrumentWidget = {
  id: string;
  instrumentKey: GrainInstrumentKey;
  venue: GrainVenue;
  instrument: string;
  title: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  updatedAt?: string;
  lastPrice?: number;
  changeAbs?: number;
  changePct?: number;
  timeframe: "1d" | "7d" | "indicative";
  unit: string;
  series: GrainSeriesPoint[];
  fallbackReason?: string;
};

export type GrainComparisonWidget = {
  id: string;
  title: string;
  status: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution: string;
  leftLabel: string;
  rightLabel: string;
  leftValue?: number;
  rightValue?: number;
  spread?: number;
  spreadPct?: number;
  note: string;
};

export type GrainProviderDebug = {
  id: string;
  enabled: boolean;
  status: GrainWidgetStatus;
  cacheAgeSec?: number;
  lastSuccessAt?: string;
  fallbackMode: boolean;
  lastError?: string;
};

export type GrainMarketsResponse = {
  widgets: GrainInstrumentWidget[];
  comparisons: GrainComparisonWidget[];
  meta: {
    generatedAt: string;
    cacheAgeSec?: number;
    partialFailure?: boolean;
  };
};

export interface GrainMarketsProvider {
  id: "cbot" | "euronext";
  enabled: boolean;
  getWidgets(): Promise<GrainInstrumentWidget[]>;
  mockFallback(reason: string): GrainInstrumentWidget[];
}
