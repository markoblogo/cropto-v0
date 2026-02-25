export type LogisticsIndicatorType = "bdi" | "rail_tariff" | "logistics_pressure";
export type LogisticsIndicatorStatus = "LIVE" | "REFRESH" | "DELAYED" | "FALLBACK" | "OFFLINE";

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
  trendLabel: "Rising" | "Cooling" | "Stable" | "Elevated";
  timeframe: string;
  unit: string;
  series: LogisticsIndicatorPoint[];
  notes?: string;
  fallbackReason?: string;
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
  load(): Promise<LogisticsIndicatorWidgetData>;
  mockFallback(reason: string): LogisticsIndicatorWidgetData;
}
