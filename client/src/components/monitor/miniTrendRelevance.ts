type TrendPoint = { value: number; ts?: string; label?: string };

export type MiniTrendRenderMode = "sparkline" | "trend_marker" | "neutral";
export type MiniTrendPolicy = "strict" | "relaxed" | "off";

export function getMiniTrendRenderMode(args: {
  series?: TrendPoint[];
  change?: number;
  changePct?: number;
  status?: string;
  section?: "core" | "expansion" | "context" | "signals" | "panels";
  cardKind?: "instrument" | "comparison" | "row" | "index" | "signal" | "fallback";
  sourceName?: string;
  providerId?: string;
  staleAgeSec?: number;
  cacheTtlSec?: number;
  preferMarkerForFallback?: boolean;
  policy?: MiniTrendPolicy;
  trustedSeries?: boolean;
  minPoints?: number;
}): { mode: MiniTrendRenderMode; reason: string } {
  const policy = args.policy ?? "strict";
  const hasDelta =
    (typeof args.change === "number" && Number.isFinite(args.change)) ||
    (typeof args.changePct === "number" && Number.isFinite(args.changePct));
  const status = (args.status || "").toUpperCase();
  const section = args.section ?? "context";
  const cardKind = args.cardKind ?? "row";
  const source = String(args.sourceName || "").toLowerCase();
  const providerId = String(args.providerId || "").toLowerCase();
  const staleAgeSec = args.staleAgeSec;
  const cacheTtlSec = args.cacheTtlSec;
  const preferMarkerForFallback = args.preferMarkerForFallback ?? true;

  if (policy === "off") {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "policy_off" };
  }

  if (status === "OFFLINE") {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "offline_status" };
  }

  const inPrimaryMarketLayer = section === "core" || section === "expansion";

  if (preferMarkerForFallback && status === "FALLBACK") {
    const canRelaxFallback =
      inPrimaryMarketLayer &&
      policy === "relaxed" &&
      args.trustedSeries !== false &&
      typeof staleAgeSec === "number" &&
      Number.isFinite(staleAgeSec) &&
      typeof cacheTtlSec === "number" &&
      Number.isFinite(cacheTtlSec) &&
      staleAgeSec <= cacheTtlSec * 2;

    if (!canRelaxFallback) {
      return { mode: hasDelta ? "trend_marker" : "neutral", reason: "fallback_conservative" };
    }
  }

  if (args.trustedSeries === false) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "series_untrusted" };
  }

  const rawSeries = (args.series || []).slice();
  rawSeries.sort((left, right) => {
    const l = left?.ts ? Date.parse(left.ts) : NaN;
    const r = right?.ts ? Date.parse(right.ts) : NaN;
    if (Number.isFinite(l) && Number.isFinite(r) && l !== r) return l - r;
    return 0;
  });

  const validSeries = rawSeries.filter((p) => typeof p?.value === "number" && Number.isFinite(p.value));
  const minPoints =
    args.minPoints ??
    (section === "core" && (cardKind === "instrument" || cardKind === "comparison")
      ? 6
      : section === "expansion" && cardKind === "row"
        ? 5
        : policy === "relaxed"
          ? 4
          : 5);

  if (validSeries.length < minPoints) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "insufficient_points" };
  }

  const values = validSeries.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variation = max - min;
  const maxAbs = Math.max(Math.abs(max), Math.abs(min), 1e-9);
  const relativeVariation = variation / maxAbs;
  if (variation < 1e-9) return { mode: hasDelta ? "trend_marker" : "neutral", reason: "flat_series" };
  if (relativeVariation < 0.0015) return { mode: hasDelta ? "trend_marker" : "neutral", reason: "near_flat" };

  const unique = new Set(values.map((value) => Number(value.toFixed(6)))).size;
  if (unique < 2) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "flat_series" };
  }

  const buckets = new Map<number, number>();
  for (const value of values.map((value) => Number(value.toFixed(6)))) {
    buckets.set(value, (buckets.get(value) || 0) + 1);
  }
  const mostRepeated = Math.max(...buckets.values());
  if (mostRepeated / values.length > 0.7) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "repeated_values" };
  }

  if (policy === "strict" && !inPrimaryMarketLayer) {
    if (source.includes("mock") || source.includes("demo") || providerId.includes("mock")) {
      return { mode: hasDelta ? "trend_marker" : "neutral", reason: "strict_policy" };
    }
  }

  if (policy === "strict" && validSeries.length < Math.max(6, minPoints)) {
    return { mode: hasDelta ? "trend_marker" : "neutral", reason: "strict_low_points" };
  }

  return { mode: "sparkline", reason: "valid_series" };
}
