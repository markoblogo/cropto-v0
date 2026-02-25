import { BDI_FETCH_TIMEOUT_MS, BDI_SOURCE_URL, ENABLE_BDI_WIDGET } from "../config";
import type { LogisticsIndicatorProvider, LogisticsIndicatorWidgetData } from "../types";
import { computeDelta, fetchTextWithTimeout, makeMockSeries, parseCsvSeries, toIndicatorSeries, trendLabel } from "./utils";

export class BdiProvider implements LogisticsIndicatorProvider {
  readonly id = "bdi" as const;
  readonly enabled = ENABLE_BDI_WIDGET;

  async load(): Promise<LogisticsIndicatorWidgetData> {
    const csv = await fetchTextWithTimeout(BDI_SOURCE_URL, BDI_FETCH_TIMEOUT_MS);
    const seriesRaw = parseCsvSeries(csv);
    if (!seriesRaw.length) throw new Error("bdi_series_empty");

    const delta = computeDelta(seriesRaw);
    const series = toIndicatorSeries(seriesRaw, 12);
    const latest = seriesRaw[seriesRaw.length - 1];
    return {
      id: "bdi-widget",
      type: "bdi",
      title: "Baltic Dry Index (BDI)",
      subtitle: "Freight stress proxy for dry bulk shipping",
      status: "REFRESH",
      sourceName: "FRED / Baltic Exchange",
      sourceAttribution: "Public series BDIY via FRED",
      sourceUrl: "https://fred.stlouisfed.org/series/BDIY",
      updatedAt: latest?.date,
      valueCurrent: delta.current,
      valueChange: delta.delta,
      valueChangePct: delta.deltaPct,
      trendLabel: trendLabel(delta.delta),
      timeframe: "7d",
      unit: "index",
      series,
      notes: "Demo-grade proxy. Daily cadence, not tick-level market data.",
    };
  }

  mockFallback(reason: string): LogisticsIndicatorWidgetData {
    const series = makeMockSeries(1700, 60, 12);
    const current = series[series.length - 1]?.value;
    const previous = series[series.length - 2]?.value;
    const delta = current != null && previous != null ? Number((current - previous).toFixed(2)) : undefined;
    const deltaPct = current != null && previous ? Number((((current - previous) / previous) * 100).toFixed(2)) : undefined;
    return {
      id: "bdi-widget",
      type: "bdi",
      title: "Baltic Dry Index (BDI)",
      subtitle: "Freight stress proxy for dry bulk shipping",
      status: "FALLBACK",
      sourceName: "FRED / Baltic Exchange",
      sourceAttribution: "Fallback demo sample (source unavailable)",
      sourceUrl: "https://fred.stlouisfed.org/series/BDIY",
      updatedAt: new Date().toISOString(),
      valueCurrent: current,
      valueChange: delta,
      valueChangePct: deltaPct,
      trendLabel: trendLabel(delta),
      timeframe: "7d",
      unit: "index",
      series,
      fallbackReason: reason,
      notes: "Fallback sample used while source is unavailable.",
    };
  }
}
