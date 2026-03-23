import { ENABLE_USDA_RAIL_WIDGET, USDA_GTR_FETCH_TIMEOUT_MS, USDA_GTR_RAIL_TARIFF_URL } from "../config";
import type { LogisticsIndicatorProvider, LogisticsIndicatorWidgetData, LogisticsPressureContext } from "../types";
import { computeDelta, fetchTextWithTimeout, makeMockSeries, parseCsvSeries, toIndicatorSeries, trendLabel } from "./utils";

export class UsdaRailProvider implements LogisticsIndicatorProvider {
  readonly id = "rail_tariff" as const;
  readonly enabled = ENABLE_USDA_RAIL_WIDGET;

  async getWidgetData(_context?: LogisticsPressureContext): Promise<LogisticsIndicatorWidgetData> {
    const csv = await fetchTextWithTimeout(USDA_GTR_RAIL_TARIFF_URL, USDA_GTR_FETCH_TIMEOUT_MS);
    const seriesRaw = parseCsvSeries(csv);
    if (!seriesRaw.length) throw new Error("usda_rail_series_empty");

    const delta = computeDelta(seriesRaw);
    const series = toIndicatorSeries(seriesRaw, 12);
    const latest = seriesRaw[seriesRaw.length - 1];
    return {
      id: "usda-rail-widget",
      type: "rail_tariff",
      title: "USDA Rail Tariff Trend",
      subtitle: "Grain transportation tariff direction",
      status: "DELAYED",
      sourceName: "USDA AMS / GTR",
      sourceAttribution: "USDA AMS Grain Transportation Report dataset",
      sourceUrl: "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report",
      updatedAt: latest?.date,
      valueCurrent: delta.current,
      valueChange: delta.delta,
      valueChangePct: delta.deltaPct,
      trendLabel: trendLabel(delta.delta),
      timeframe: "weekly",
      unit: "index",
      series,
      notes: ["Authoritative dataset trend (non-realtime)."],
    };
  }

  mockFallback(reason: string): LogisticsIndicatorWidgetData {
    const series = makeMockSeries(220, 8, 12);
    const current = series[series.length - 1]?.value;
    const previous = series[series.length - 2]?.value;
    const delta = current != null && previous != null ? Number((current - previous).toFixed(2)) : undefined;
    const deltaPct = current != null && previous ? Number((((current - previous) / previous) * 100).toFixed(2)) : undefined;
    return {
      id: "usda-rail-widget",
      type: "rail_tariff",
      title: "USDA Rail Tariff Trend",
      subtitle: "Grain transportation tariff direction",
      status: "FALLBACK",
      sourceName: "USDA AMS / GTR",
      sourceAttribution: "Fallback demo sample (source unavailable)",
      sourceUrl: "https://www.ams.usda.gov/services/transportation-analysis/grain-transportation-report",
      updatedAt: new Date().toISOString(),
      valueCurrent: current,
      valueChange: delta,
      valueChangePct: deltaPct,
      trendLabel: trendLabel(delta),
      timeframe: "weekly",
      unit: "index",
      series,
      fallbackReason: reason,
      notes: ["Fallback sample used while USDA series is unavailable."],
    };
  }
}
