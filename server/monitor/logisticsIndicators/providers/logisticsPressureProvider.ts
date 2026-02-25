import { ENABLE_LOGISTICS_PRESSURE_WIDGET } from "../config";
import type {
  Direction,
  LogisticsIndicatorProvider,
  LogisticsIndicatorWidgetData,
  LogisticsPressureBreakdown,
  LogisticsPressureContext,
  LogisticsPressureInputs,
  LogisticsPressureSeriesWindow,
} from "../types";
import { getMonitorNews } from "../../newsService";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function saturatingCount(count: number, k: number): number {
  return 1 - Math.exp(-Math.max(0, count) / k);
}

function relativeDelta(curr: number, prev: number): number {
  if (prev <= 0 && curr <= 0) return 0;
  if (prev <= 0 && curr > 0) return 1;
  return (curr - prev) / prev;
}

function deltaToPressureScore(delta: number, cap = 1.5): number {
  const d = Math.max(-1, Math.min(cap, delta));
  return (d + 1) / (cap + 1);
}

function directionScore(direction: Direction = "unknown", changePct?: number): number {
  if (direction === "unknown") return 0.5;
  if (direction === "flat") return 0.5;
  let base = direction === "up" ? 0.65 : 0.35;
  if (typeof changePct === "number" && Number.isFinite(changePct)) {
    const mag = clamp01(Math.abs(changePct) / 10);
    base += direction === "up" ? 0.2 * mag : -0.2 * mag;
  }
  return clamp01(base);
}

function pressureLevel(score: number): NonNullable<LogisticsIndicatorWidgetData["level"]> {
  if (score >= 80) return "Severe";
  if (score >= 65) return "High";
  if (score >= 45) return "Elevated";
  if (score >= 25) return "Moderate";
  return "Low";
}

function pressureTrendLabel(delta: number): LogisticsIndicatorWidgetData["trendLabel"] {
  if (delta >= 0.35) return "Rising";
  if (delta >= 0.1) return "Building";
  if (delta <= -0.35) return "Easing";
  if (delta <= -0.1) return "Cooling";
  return "Stable";
}

function buildExplanation(level: string, trend: LogisticsIndicatorWidgetData["trendLabel"], b: { eventIntensity: number; blackSeaFocus: number; frictionFactors: number; transportContext: number }): string {
  const parts: string[] = [];
  if (b.eventIntensity > 0.7) parts.push("high-impact logistics signals increased");
  else if (b.eventIntensity > 0.45) parts.push("logistics activity remains elevated");
  else parts.push("logistics event flow is relatively contained");

  if (b.blackSeaFocus > 0.7) parts.push("with strong Black Sea concentration");
  else if (b.blackSeaFocus > 0.45) parts.push("with notable Black Sea relevance");

  if (b.frictionFactors > 0.65) parts.push("amid policy/weather friction");
  else if (b.frictionFactors > 0.45) parts.push("with mixed policy/weather disruptions");

  if (b.transportContext > 0.6) parts.push("and firmer transport cost context");
  else if (b.transportContext < 0.4) parts.push("while transport cost context is easing");

  return `${level} logistics pressure is ${trend.toLowerCase()}: ${parts.slice(0, 3).join(", ")}.`;
}

export function computeLogisticsPressure(inputs: LogisticsPressureInputs): {
  score: number;
  delta: number;
  breakdown: LogisticsPressureBreakdown;
} {
  const highImpactN = saturatingCount(inputs.logisticsHighImpact24h, 4);
  const logisticsAllN = saturatingCount(inputs.logisticsSignals24h, 10);
  const eventIntensity = clamp01(highImpactN * 0.65 + logisticsAllN * 0.35);

  const delta = relativeDelta(inputs.logisticsSignals24h, inputs.logisticsSignalsPrev24h);
  const trendPressure = deltaToPressureScore(delta, 1.5);

  const blackSeaN = saturatingCount(inputs.blackSeaLogistics24h, 4);
  const blackSeaShare = inputs.logisticsSignals24h > 0 ? clamp01(inputs.blackSeaLogistics24h / inputs.logisticsSignals24h) : 0;
  const blackSeaFocus = clamp01(blackSeaN * 0.7 + blackSeaShare * 0.3);

  const policyN = saturatingCount(inputs.policyTrade24h, 5);
  const weatherN = saturatingCount(inputs.weatherLogisticsCooccurrence24h, 3);
  const frictionFactors = clamp01(policyN * 0.6 + weatherN * 0.4);

  const bdi = directionScore(inputs.bdiDirection ?? "unknown", inputs.bdiChangePct ?? undefined);
  const rail = directionScore(inputs.railDirection ?? "unknown", inputs.railChangePct ?? undefined);
  const transportContext = clamp01(bdi * 0.5 + rail * 0.5);

  const diversityN = saturatingCount(inputs.sourceDiversity24h, 6);
  const activityN = saturatingCount(inputs.logisticsSignals24h, 8);
  const confidence = clamp01(diversityN * 0.6 + activityN * 0.4);

  const rawScore =
    eventIntensity * 0.35 +
    trendPressure * 0.2 +
    blackSeaFocus * 0.2 +
    frictionFactors * 0.15 +
    transportContext * 0.1;
  const centered = rawScore - 0.5;
  const confidenceAdjusted = 0.5 + centered * (0.6 + 0.4 * confidence);
  const score = Math.round(clamp01(confidenceAdjusted) * 100);

  return {
    score,
    delta,
    breakdown: {
      eventIntensity,
      trendPressure,
      blackSeaFocus,
      frictionFactors,
      transportContext,
      confidence,
    },
  };
}

export class LogisticsPressureProvider implements LogisticsIndicatorProvider {
  readonly id = "logistics_pressure" as const;
  readonly enabled = ENABLE_LOGISTICS_PRESSURE_WIDGET;

  async getWidgetData(context?: LogisticsPressureContext): Promise<LogisticsIndicatorWidgetData> {
    const { items } = await getMonitorNews(false);
    const computeWindow = (window: LogisticsPressureSeriesWindow) => {
      const startMs = window.start.getTime();
      const endMs = window.end.getTime();
      const prevStartMs = window.prevStart.getTime();
      const prevEndMs = window.prevEnd.getTime();

      const cur = items.filter((item) => {
        const t = Date.parse(item.published_at);
        return Number.isFinite(t) && t >= startMs && t < endMs;
      });
      const prev = items.filter((item) => {
        const t = Date.parse(item.published_at);
        return Number.isFinite(t) && t >= prevStartMs && t < prevEndMs;
      });

      const logisticsCurr = cur.filter((item) => item.topic_tags.includes("logistics"));
      const logisticsPrev = prev.filter((item) => item.topic_tags.includes("logistics"));

      const logisticsHighImpact24h = logisticsCurr.filter((item) => item.relevance_score >= 10).length;
      const logisticsSignals24h = logisticsCurr.length;
      const logisticsSignalsPrev24h = logisticsPrev.length;
      const blackSeaLogistics24h = logisticsCurr.filter((item) =>
        item.region_tags.some((tag) => ["black sea", "ukraine", "romania", "bulgaria", "poland"].some((needle) => tag.includes(needle))),
      ).length;
      const policyTrade24h = cur.filter((item) => item.topic_tags.includes("policy") || item.topic_tags.includes("trade")).length;
      const weatherLogisticsCooccurrence24h = cur.filter(
        (item) => item.topic_tags.includes("weather") && (item.topic_tags.includes("logistics") || logisticsCurr.includes(item)),
      ).length;
      const sourceDiversity24h = new Set(logisticsCurr.map((item) => item.source_name)).size;

      return computeLogisticsPressure({
        logisticsHighImpact24h,
        logisticsSignals24h,
        logisticsSignalsPrev24h,
        blackSeaLogistics24h,
        policyTrade24h,
        weatherLogisticsCooccurrence24h,
        sourceDiversity24h,
        bdiDirection: context?.bdiDirection ?? "unknown",
        bdiChangePct: context?.bdiChangePct ?? null,
        railDirection: context?.railDirection ?? "unknown",
        railChangePct: context?.railChangePct ?? null,
      });
    };

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const currentWindow: LogisticsPressureSeriesWindow = {
      start: new Date(now - dayMs),
      end: new Date(now),
      prevStart: new Date(now - 2 * dayMs),
      prevEnd: new Date(now - dayMs),
    };
    const computed = computeWindow(currentWindow);
    const series = Array.from({ length: 7 }).map((_, idx) => {
      const end = new Date(now - (6 - idx) * dayMs);
      const start = new Date(end.getTime() - dayMs);
      const prevEnd = new Date(start.getTime());
      const prevStart = new Date(prevEnd.getTime() - dayMs);
      const window: LogisticsPressureSeriesWindow = { start, end, prevStart, prevEnd };
      return { ts: end.toISOString(), value: computeWindow(window).score };
    });
    const prevScore = series[series.length - 2]?.value ?? computed.score;
    const deltaScore = Number((computed.score - prevScore).toFixed(2));
    const deltaPct = prevScore > 0 ? Number((((computed.score - prevScore) / prevScore) * 100).toFixed(2)) : undefined;
    const level = pressureLevel(computed.score);
    const trend = pressureTrendLabel(computed.delta);
    const explanation = buildExplanation(level, trend, computed.breakdown);
    const notes: string[] = ["Rule-based composite for demo use; not a trading signal."];
    if (!context?.bdiDirection || context.bdiDirection === "unknown") {
      notes.push("BDI context unavailable; neutral transport context applied.");
    }
    if (!context?.railDirection || context.railDirection === "unknown") {
      notes.push("Rail trend unavailable; neutral transport context applied.");
    }

    return {
      id: "logistics-pressure-widget",
      type: "logistics_pressure",
      title: "Logistics Pressure",
      subtitle: "Signal-derived composite (24h vs prior 24h)",
      status: "REFRESH",
      sourceName: "Cropto Monitor Signals",
      sourceAttribution: "Derived from monitor signals + optional BDI/rail context",
      sourceUrl: "/monitor?debug=1",
      updatedAt: new Date().toISOString(),
      valueCurrent: computed.score,
      valueChange: deltaScore,
      valueChangePct: deltaPct,
      trendLabel: trend,
      timeframe: "24h",
      unit: "score",
      level,
      explanation,
      components: {
        eventIntensity: Math.round(computed.breakdown.eventIntensity * 100),
        blackSeaFocus: Math.round(computed.breakdown.blackSeaFocus * 100),
        frictionFactors: Math.round(computed.breakdown.frictionFactors * 100),
        transportContext: Math.round(computed.breakdown.transportContext * 100),
        confidence: Math.round(computed.breakdown.confidence * 100),
      },
      series,
      notes,
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
      level: "Elevated",
      explanation: "Elevated logistics pressure: high-impact logistics signals increased, with strong Black Sea concentration.",
      components: {
        eventIntensity: 68,
        blackSeaFocus: 72,
        frictionFactors: 61,
        transportContext: 50,
        confidence: 56,
      },
      series: Array.from({ length: 7 }).map((_, idx) => ({
        ts: new Date(now - (6 - idx) * 24 * 60 * 60 * 1000).toISOString(),
        value: Number((44 + idx * 1.6).toFixed(2)),
      })),
      fallbackReason: reason,
      notes: ["Fallback sample while signal pipeline is unavailable."],
    };
  }
}
