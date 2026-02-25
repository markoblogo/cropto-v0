type TrendPoint = { value: number };

export type MiniTrendRenderMode = "sparkline" | "trend_marker" | "neutral";

export function getMiniTrendRenderMode(args: {
  series?: TrendPoint[];
  change?: number;
  changePct?: number;
  status?: string;
  preferMarkerForFallback?: boolean;
}): { mode: MiniTrendRenderMode; reason: string } {
  const hasDelta =
    (typeof args.change === "number" && Number.isFinite(args.change)) ||
    (typeof args.changePct === "number" && Number.isFinite(args.changePct));
  const status = (args.status || "").toUpperCase();
  const preferMarkerForFallback = args.preferMarkerForFallback ?? true;

  if (status === "OFFLINE") {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "offline_status" };
  }

  if (preferMarkerForFallback && status === "FALLBACK") {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "fallback_status" };
  }

  const rawSeries = args.series || [];
  const validSeries = rawSeries.filter((p) => typeof p?.value === "number" && Number.isFinite(p.value));
  if (validSeries.length < 2) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "no_series" };
  }

  const values = validSeries.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variation = max - min;

  // Flat or near-flat lines are noisy in compact cards; use marker/neutral instead.
  if (variation < 1e-6) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "low_variation" };
  }

  return { mode: "sparkline", reason: "valid_series" };
}
