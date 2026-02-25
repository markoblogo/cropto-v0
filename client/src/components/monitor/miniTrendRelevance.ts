type TrendPoint = { value: number };

export type MiniTrendRenderMode = "sparkline" | "trend_marker" | "neutral";
export type MiniTrendPolicy = "strict" | "relaxed" | "off";

export function getMiniTrendRenderMode(args: {
  series?: TrendPoint[];
  change?: number;
  changePct?: number;
  status?: string;
  preferMarkerForFallback?: boolean;
  policy?: MiniTrendPolicy;
}): { mode: MiniTrendRenderMode; reason: string } {
  const policy = args.policy ?? "strict";
  const hasDelta =
    (typeof args.change === "number" && Number.isFinite(args.change)) ||
    (typeof args.changePct === "number" && Number.isFinite(args.changePct));
  const status = (args.status || "").toUpperCase();
  const preferMarkerForFallback = args.preferMarkerForFallback ?? true;

  if (policy === "off") {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "policy_off" };
  }

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

  // Flat or near-flat lines are noisy in strict sections; relaxed keeps slightly flatter lines.
  const variationThreshold = policy === "relaxed" ? 1e-8 : 1e-6;
  if (variation < variationThreshold) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "low_variation" };
  }

  if (policy === "strict" && validSeries.length < 3) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "strict_low_points" };
  }

  return { mode: "sparkline", reason: "valid_series" };
}
