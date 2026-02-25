import {
  normalizeGrainPriceToUsdTon,
  type FxSnapshot,
  type NativePriceQuote,
  type NativePriceUnit,
} from "../../grainMarkets/normalization";
import type {
  GrainWidgetLivestockFeedTieIn,
  GrainWidgetLivestockFeedRow,
  GrainWidgetPriceValue,
  GrainWidgetStatus,
} from "../types";

export interface LivestockFeedRawRow {
  id: string;
  label: string;
  sublabel?: string;
  region?: string;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  currency?: string;
  unit?: string;
  nativeUnitType?: NativePriceUnit;
  cropHint?: "corn" | "wheat" | "soybeans";
  sourceName?: string;
  sourceAttribution?: string;
  updatedAt?: string;
  tags?: string[];
  notes?: string[];
  status?: GrainWidgetStatus;
  metricSemanticKind?: "price" | "index" | "composite" | "signal";
}

export interface LivestockTieInBuilderInput {
  widgetId?: string;
  title?: string;
  subtitle?: string;
  status?: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  asOf?: string;
  notes?: string[];
  fallbackReason?: string;
  rows: LivestockFeedRawRow[];
  fx?: FxSnapshot;
  derivedFrom?: Array<{
    source: "grainMarkets" | "grainWidgets" | "external";
    key: string;
    label?: string;
  }>;
  buildDerivedCue?: boolean;
}

function pickWorstStatus(statuses: GrainWidgetStatus[]): GrainWidgetStatus {
  const rank: Record<GrainWidgetStatus, number> = {
    LIVE: 6,
    REFRESH: 5,
    DELAYED: 4,
    INDICATIVE: 3,
    FALLBACK: 2,
    OFFLINE: 1,
  };
  if (!statuses.length) return "OFFLINE";
  return statuses.reduce((worst, current) => (rank[current] < rank[worst] ? current : worst), statuses[0]);
}

function mapNormalizationToPriceValue(raw: LivestockFeedRawRow, fx?: FxSnapshot): GrainWidgetPriceValue {
  const quote: NativePriceQuote = {
    valueCurrent: raw.valueCurrent,
    valueChange: raw.valueChange,
    valueChangePct: raw.valueChangePct,
    currency: raw.currency,
    unit: raw.unit,
    nativeUnitType: raw.nativeUnitType ?? "UNKNOWN",
    crop: raw.cropHint,
  };
  const norm = normalizeGrainPriceToUsdTon({ quote, fx });
  return {
    nativeValueCurrent: norm.native.valueCurrent,
    nativeValueChange: norm.native.valueChange,
    nativeValueChangePct: norm.native.valueChangePct,
    nativeCurrency: norm.native.currency,
    nativeUnit: norm.native.unit,
    nativeLabel:
      norm.native.valueCurrent != null && norm.native.unit
        ? `${norm.native.valueCurrent} ${norm.native.unit}`
        : undefined,
    normalizedValueCurrent: norm.normalized?.valueCurrent,
    normalizedValueChange: norm.normalized?.valueChange,
    normalizedValueChangePct: norm.normalized?.valueChangePct,
    normalizedCurrency: norm.normalized?.currency,
    normalizedUnit: norm.normalized?.unit,
    normalizationStatus: norm.status,
    normalizationMethod: norm.meta.method,
    normalizationMeta: {
      fxRateUsed: norm.meta.fxRateUsed,
      bushelsPerTon: norm.meta.bushelsPerTon,
      cropFactor: norm.meta.cropFactor,
      notes: norm.meta.notes,
    },
  };
}

function deriveFeedTieInCue(rows: GrainWidgetLivestockFeedRow[]) {
  const soyMeal = rows.find((row) => /soy meal/i.test(row.label));
  const cornFeed = rows.find((row) => /corn feed/i.test(row.label)) ?? rows.find((row) => /feed/i.test(row.label));
  const soyPct = soyMeal?.price?.normalizedValueChangePct ?? soyMeal?.price?.nativeValueChangePct;
  const cornFeedPct = cornFeed?.price?.normalizedValueChangePct ?? cornFeed?.price?.nativeValueChangePct;

  if (typeof soyPct !== "number" && typeof cornFeedPct !== "number") {
    return { label: "Unavailable" as const, notes: ["Not enough feed/meal rows for derived cue"] };
  }

  const values = [soyPct, cornFeedPct].filter((v): v is number => typeof v === "number");
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg > 0.6) return { label: "Feed demand supportive" as const, score: 70 + Math.min(30, avg * 10) };
  if (avg < -0.6) return { label: "Soft" as const, score: Math.max(0, 30 + avg * 10) };
  return { label: "Mixed" as const, score: 50 };
}

export function buildLivestockTieInWidget(input: LivestockTieInBuilderInput): GrainWidgetLivestockFeedTieIn {
  const statuses: GrainWidgetStatus[] = [];
  let normOk = 0;
  let normPartial = 0;
  let normFxMissing = 0;
  let normUnavailable = 0;

  const rows: GrainWidgetLivestockFeedRow[] = input.rows.map((raw) => {
    const metricSemanticKind = raw.metricSemanticKind ?? "price";
    const price = metricSemanticKind === "price" ? mapNormalizationToPriceValue(raw, input.fx) : undefined;
    if (price) {
      if (price.normalizationStatus === "OK") normOk += 1;
      else if (price.normalizationStatus === "PARTIAL") normPartial += 1;
      else if (price.normalizationStatus === "FX_MISSING") normFxMissing += 1;
      else normUnavailable += 1;
    }
    const status = raw.status ?? input.status ?? "INDICATIVE";
    statuses.push(status);
    return {
      id: raw.id,
      label: raw.label,
      sublabel: raw.sublabel,
      region: raw.region,
      metricSemanticKind,
      price,
      status,
      sourceName: raw.sourceName ?? input.sourceName,
      sourceAttribution: raw.sourceAttribution ?? input.sourceAttribution,
      updatedAt: raw.updatedAt ?? input.updatedAt,
      tags: raw.tags,
      notes: raw.notes,
    };
  });

  const derived = input.buildDerivedCue ? deriveFeedTieInCue(rows) : undefined;
  return {
    id: input.widgetId ?? "grain-livestock-feed-tiein",
    kind: "LIVESTOCK_FEED_TIEIN",
    title: input.title ?? "Feed / Livestock Tie-in",
    subtitle: input.subtitle ?? "Soy meal, corn feed and related feed-side indicators",
    status: input.status ?? (rows.length ? pickWorstStatus(statuses) : "OFFLINE"),
    sourceName: input.sourceName,
    sourceAttribution: input.sourceAttribution,
    sourceUrl: input.sourceUrl,
    updatedAt: input.updatedAt,
    asOf: input.asOf,
    notes: input.notes,
    fallbackReason: input.fallbackReason,
    rows,
    summary: {
      rowCount: rows.length,
      derivedCue: derived
        ? {
            label: derived.label,
            score: derived.score,
            status: input.status ?? "INDICATIVE",
            notes: derived.notes,
          }
        : undefined,
      normalizedCoverage: {
        ok: normOk,
        partial: normPartial,
        fxMissing: normFxMissing,
        unavailable: normUnavailable,
      },
    },
    derivedFrom: input.derivedFrom,
  };
}
