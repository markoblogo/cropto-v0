import { ENABLE_LOGISTICS_PRESSURE_WIDGET } from "../config";
import type { LogisticsIndicatorProvider, LogisticsIndicatorWidgetData } from "../types";
import { getMonitorNews } from "../../newsService";

function classifyTrend(delta: number): LogisticsIndicatorWidgetData["trendLabel"] {
  if (delta >= 6) return "Elevated";
  if (delta >= 2) return "Rising";
  if (delta <= -2) return "Cooling";
  return "Stable";
}

export class LogisticsPressureProvider implements LogisticsIndicatorProvider {
  readonly id = "logistics_pressure" as const;
  readonly enabled = ENABLE_LOGISTICS_PRESSURE_WIDGET;

  async load(): Promise<LogisticsIndicatorWidgetData> {
    const { items } = await getMonitorNews(false);
    const now = Date.now();
    const in24 = (ts: string) => now - Date.parse(ts) <= 24 * 60 * 60 * 1000;
    const in48 = (ts: string) => {
      const d = now - Date.parse(ts);
      return d > 24 * 60 * 60 * 1000 && d <= 48 * 60 * 60 * 1000;
    };

    const cur = items.filter((item) => in24(item.published_at));
    const prev = items.filter((item) => in48(item.published_at));

    const curSignals = cur.filter((item) => item.topic_tags.some((tag) => ["logistics", "policy", "weather", "trade"].includes(tag)));
    const prevSignals = prev.filter((item) => item.topic_tags.some((tag) => ["logistics", "policy", "weather", "trade"].includes(tag)));
    const curHigh = curSignals.filter((item) => item.relevance_score >= 10).length;
    const prevHigh = prevSignals.filter((item) => item.relevance_score >= 10).length;

    const scoreCur = Math.max(0, Math.min(100, 32 + curSignals.length * 2 + curHigh * 5));
    const scorePrev = Math.max(0, Math.min(100, 32 + prevSignals.length * 2 + prevHigh * 5));
    const delta = Number((scoreCur - scorePrev).toFixed(2));
    const deltaPct = scorePrev > 0 ? Number((((scoreCur - scorePrev) / scorePrev) * 100).toFixed(2)) : undefined;

    const series = [
      { ts: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(), value: Math.max(0, scoreCur - 8) },
      { ts: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), value: Math.max(0, scoreCur - 6) },
      { ts: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(), value: Math.max(0, scoreCur - 7) },
      { ts: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), value: Math.max(0, scoreCur - 4) },
      { ts: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), value: Math.max(0, scorePrev) },
      { ts: new Date(now - 24 * 60 * 60 * 1000).toISOString(), value: Math.max(0, scorePrev + delta / 2) },
      { ts: new Date(now).toISOString(), value: scoreCur },
    ].map((point) => ({ ...point, value: Number(point.value.toFixed(2)) }));

    return {
      id: "logistics-pressure-widget",
      type: "logistics_pressure",
      title: "Logistics Pressure",
      subtitle: "Signal-derived freight and corridor stress",
      status: "REFRESH",
      sourceName: "Cropto Monitor Signals",
      sourceAttribution: "Derived from logistics/policy/weather tagged signals",
      sourceUrl: "/monitor?debug=1",
      updatedAt: new Date().toISOString(),
      valueCurrent: scoreCur,
      valueChange: delta,
      valueChangePct: deltaPct,
      trendLabel: classifyTrend(delta),
      timeframe: "24h",
      unit: "score",
      series,
      notes: "Rule-based composite for demo use; not investment advice.",
    };
  }

  mockFallback(reason: string): LogisticsIndicatorWidgetData {
    const now = Date.now();
    return {
      id: "logistics-pressure-widget",
      type: "logistics_pressure",
      title: "Logistics Pressure",
      subtitle: "Signal-derived freight and corridor stress",
      status: "FALLBACK",
      sourceName: "Cropto Monitor Signals",
      sourceAttribution: "Fallback demo sample",
      sourceUrl: "/monitor?debug=1",
      updatedAt: new Date().toISOString(),
      valueCurrent: 54,
      valueChange: 4,
      valueChangePct: 8,
      trendLabel: "Rising",
      timeframe: "24h",
      unit: "score",
      series: Array.from({ length: 7 }).map((_, idx) => ({
        ts: new Date(now - (6 - idx) * 24 * 60 * 60 * 1000).toISOString(),
        value: Number((44 + idx * 1.6).toFixed(2)),
      })),
      fallbackReason: reason,
      notes: "Fallback sample while signal pipeline is unavailable.",
    };
  }
}
