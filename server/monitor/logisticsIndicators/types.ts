export type LogisticsIndicatorType = "bdi" | "rail_tariff" | "logistics_pressure";
export type LogisticsIndicatorStatus = "LIVE" | "REFRESH" | "DELAYED" | "FALLBACK" | "OFFLINE";
export type Direction = "up" | "down" | "flat" | "unknown";

export type LogisticsIndicatorPoint = {
  ts: string;
  value: number;
};

export type LogisticsIndicatorWidgetData = {
  id: string;
  type: LogisticsIndicatorType;
  title: string;
  subtitle: string;
  status: LogisticsIndicatorStatus;
  sourceName: string;
  sourceAttribution: string;
  sourceUrl: string;
  updatedAt?: string;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  trendLabel: "Rising" | "Building" | "Stable" | "Cooling" | "Easing" | "Elevated";
  timeframe: string;
  unit: string;
  series: LogisticsIndicatorPoint[];
  level?: "Low" | "Moderate" | "Elevated" | "High" | "Severe";
  explanation?: string;
  components?: {
    eventIntensity: number;
    blackSeaFocus: number;
    frictionFactors: number;
    transportContext: number;
    confidence: number;
  };
  notes?: string[];
  fallbackReason?: string;
};

export type LogisticsPressureContext = {
  bdiDirection?: Direction;
  bdiChangePct?: number;
  railDirection?: Direction;
  railChangePct?: number;
};

export type LogisticsPressureInputs = {
  logisticsHighImpact24h: number;
  logisticsSignals24h: number;
  logisticsSignalsPrev24h: number;
  blackSeaLogistics24h: number;
  policyTrade24h: number;
  weatherLogisticsCooccurrence24h: number;
  sourceDiversity24h: number;
  bdiDirection?: Direction;
  bdiChangePct?: number | null;
  railDirection?: Direction;
  railChangePct?: number | null;
};

export type LogisticsPressureBreakdown = {
  eventIntensity: number;
  trendPressure: number;
  blackSeaFocus: number;
  frictionFactors: number;
  transportContext: number;
  confidence: number;
};

export type LogisticsPressureSeriesWindow = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
};

export type LogisticsProviderDebug = {
  id: string;
  enabled: boolean;
  status: LogisticsIndicatorStatus;
  cacheAgeSec?: number;
  lastSuccessAt?: string;
  fallbackMode: boolean;
  lastError?: string;
};

export type LogisticsIndicatorsResponse = {
  widgets: LogisticsIndicatorWidgetData[];
  meta: {
    generatedAt: string;
    cacheAgeSec?: number;
    partialFailure?: boolean;
  };
};

export interface LogisticsIndicatorProvider {
  id: LogisticsIndicatorType;
  enabled: boolean;
  getWidgetData(context?: LogisticsPressureContext): Promise<LogisticsIndicatorWidgetData>;
  mockFallback(reason: string): LogisticsIndicatorWidgetData;
}
