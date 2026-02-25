import { findQuote, mergeStatus } from "./mapping";
import type {
  GrainMarketComparisonWidget,
  GrainMarketQuoteNormalized,
  GrainMarketStatus,
  GrainMarketsWidgetsPayload,
  RelativeMoveSignal,
} from "./types";

function relativeMoveSignal(leftPct?: number, rightPct?: number): RelativeMoveSignal {
  if (typeof leftPct !== "number" || typeof rightPct !== "number") return "Unavailable";
  const diff = leftPct - rightPct;
  if (Math.abs(diff) < 0.15) return "Flat";
  if (Math.abs(diff) < 0.5) return "Mixed";
  return diff > 0 ? "US outperforming" : "EU outperforming";
}

function trendLabel(signal: RelativeMoveSignal): "Rising" | "Cooling" | "Stable" | "Mixed" {
  if (signal === "US outperforming" || signal === "EU outperforming") return "Rising";
  if (signal === "Flat") return "Stable";
  if (signal === "Mixed") return "Mixed";
  return "Cooling";
}

function comparisonStatus(left?: GrainMarketQuoteNormalized, right?: GrainMarketQuoteNormalized): GrainMarketStatus {
  if (!left || !right) return "OFFLINE";
  return mergeStatus(left.status, right.status);
}

function buildComparison(args: {
  id: GrainMarketComparisonWidget["id"];
  title: string;
  left?: GrainMarketQuoteNormalized;
  right?: GrainMarketQuoteNormalized;
  comparisonType: GrainMarketComparisonWidget["comparisonType"];
  note?: string;
  updatedAt: string;
}): GrainMarketComparisonWidget {
  const leftChangePct = args.left?.valueChangePct;
  const rightChangePct = args.right?.valueChangePct;
  const rel = relativeMoveSignal(leftChangePct, rightChangePct);
  const bothNormalized =
    args.left?.normalizationStatus === "OK" &&
    args.right?.normalizationStatus === "OK" &&
    typeof args.left.normalizedValueCurrent === "number" &&
    typeof args.right.normalizedValueCurrent === "number";
  const spreadAbs =
    bothNormalized
      ? Number((args.left!.normalizedValueCurrent! - args.right!.normalizedValueCurrent!).toFixed(2))
      : undefined;
  const spreadPct =
    bothNormalized && args.right!.normalizedValueCurrent
      ? Number(((spreadAbs! / args.right!.normalizedValueCurrent!) * 100).toFixed(2))
      : undefined;

  return {
    id: args.id,
    title: args.title,
    status: comparisonStatus(args.left, args.right),
    comparisonType: args.comparisonType,
    leftInstrumentKey: args.left?.key ?? "CBOT_CORN",
    rightInstrumentKey: args.right?.key ?? "EURONEXT_CORN",
    leftLabel: args.left?.displayName ?? "US market",
    rightLabel: args.right?.displayName ?? "EU market",
    spreadAbs,
    spreadUnit: bothNormalized ? "USD/t" : undefined,
    spreadPct,
    leftChangePct,
    rightChangePct,
    relativeMoveSignal: rel,
    trendLabel: trendLabel(rel),
    note:
      args.note ||
      (bothNormalized
        ? "Spread computed on normalized USD/t values."
        : "Units not fully normalized; showing directional % comparison only."),
    sourceAttribution: "Derived from CBOT + Euronext quotes",
    updatedAt: args.updatedAt,
    fallbackReason: !args.left || !args.right ? "missing_instrument_for_comparison" : undefined,
  };
}

export function buildComparisonWidgets(allQuotes: GrainMarketQuoteNormalized[], updatedAt: string): GrainMarketsWidgetsPayload["comparisons"] {
  const cbotWheat = findQuote(allQuotes, "CBOT_WHEAT");
  const cbotCorn = findQuote(allQuotes, "CBOT_CORN");
  const cbotSoy = findQuote(allQuotes, "CBOT_SOYBEANS");

  const euWheat = findQuote(allQuotes, "EURONEXT_MILLING_WHEAT");
  const euCorn = findQuote(allQuotes, "EURONEXT_CORN");
  const euRape = findQuote(allQuotes, "EURONEXT_RAPESEED");

  return [
    buildComparison({
      id: "WHEAT_US_EU",
      title: "Wheat US vs EU",
      left: cbotWheat,
      right: euWheat,
      comparisonType: "same-family",
      updatedAt,
    }),
    buildComparison({
      id: "CORN_US_EU",
      title: "Corn US vs EU",
      left: cbotCorn,
      right: euCorn,
      comparisonType: "same-family",
      updatedAt,
    }),
    buildComparison({
      id: "SOY_RAPE_PROXY",
      title: "Soy vs Rapeseed Proxy",
      left: cbotSoy,
      right: euRape,
      comparisonType: "proxy",
      note: "Proxy cross-market comparison (not identical contracts)",
      updatedAt,
    }),
  ];
}
