import type { MiniTrendRenderMode } from "@/components/monitor/miniTrendRelevance";

export type MonitorSectionLayer = "core" | "expansion" | "context" | "signals" | "panels";
export type MonitorCardKind = "instrument" | "comparison" | "row" | "index" | "signal" | "fallback";
export type MiniTrendPolicy = "strict" | "relaxed" | "off";
export type CardSizeVariant = "compact" | "regular" | "dense-list" | "tall" | "fallback-compact";

export const MONITOR_UI_RULES = {
  sectionTrendPolicy: {
    core: "relaxed",
    expansion: "relaxed",
    context: "strict",
    signals: "strict",
    panels: "strict",
  } satisfies Record<MonitorSectionLayer, MiniTrendPolicy>,
  defaultCardSize: {
    instrument: "regular",
    comparison: "regular",
    row: "dense-list",
    index: "compact",
    signal: "compact",
    fallback: "fallback-compact",
  } satisfies Record<MonitorCardKind, CardSizeVariant>,
  preserveRowAlignment: {
    core: true,
    expansion: true,
    context: false,
    signals: false,
    panels: false,
  } satisfies Record<MonitorSectionLayer, boolean>,
} as const;

export function getSectionTrendPolicy(section: MonitorSectionLayer): MiniTrendPolicy {
  return MONITOR_UI_RULES.sectionTrendPolicy[section];
}

export function resolveCardSizeVariant(args: {
  section: MonitorSectionLayer;
  kind: MonitorCardKind;
  status?: string;
  hasPrimaryValue?: boolean;
  hasTrend?: boolean;
}): CardSizeVariant {
  const status = (args.status || "").toUpperCase();
  if (args.kind === "fallback" || status === "OFFLINE") return "fallback-compact";
  if (!args.hasPrimaryValue) return "fallback-compact";
  if (args.kind === "row") return "dense-list";
  if (!args.hasTrend && (args.kind === "signal" || args.kind === "index")) return "compact";
  return MONITOR_UI_RULES.defaultCardSize[args.kind];
}

export function getCardSizeClass(variant: CardSizeVariant): string {
  if (variant === "dense-list") return "space-y-1";
  if (variant === "compact") return "space-y-1.5";
  if (variant === "fallback-compact") return "space-y-1";
  if (variant === "tall") return "space-y-2.5";
  return "space-y-2";
}

export function getTrendSlotClass(args: {
  section: MonitorSectionLayer;
  kind: MonitorCardKind;
  mode: MiniTrendRenderMode;
  compact?: boolean;
}): string {
  const base = args.compact ? "mt-0.5" : "mt-1";
  if (args.mode === "sparkline") {
    if (args.kind === "instrument") return `${base} h-10`;
    if (args.kind === "row" || args.kind === "signal") return `${base} h-7`;
    return `${base} h-8`;
  }
  if (args.mode === "trend_marker") {
    if (MONITOR_UI_RULES.preserveRowAlignment[args.section]) return `${base} h-5`;
    return `${base} h-4`;
  }
  if (MONITOR_UI_RULES.preserveRowAlignment[args.section]) return `${base} h-3`;
  return `${base} h-2`;
}
