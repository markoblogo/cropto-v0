import {
  normalizeGrainPriceToUsdTon,
  type FxSnapshot,
  type NativePriceQuote,
  type NativePriceUnit,
} from "../../grainMarkets/normalization";
import type {
  EmbedAvailabilityStatus,
  GrainWidgetMacroAgriIndexItem,
  GrainWidgetMacroAgriIndices,
  GrainWidgetPoint,
  GrainWidgetStatCard,
  GrainWidgetStatus,
  MacroAgriRenderMode,
} from "../types";

export interface MacroAgriRawItem {
  id: string;
  label: string;
  sublabel?: string;
  region?: string;
  metricSemanticKind: "price" | "index" | "composite" | "signal";
  status?: GrainWidgetStatus;
  valueCurrent?: number;
  valueChange?: number;
  valueChangePct?: number;
  currency?: string;
  unit?: string;
  nativeUnitType?: NativePriceUnit;
  cropHint?: "corn" | "wheat" | "soybeans";
  unitLabel?: string;
  valueLabel?: string;
  series?: GrainWidgetPoint[];
  sourceName?: string;
  sourceAttribution?: string;
  updatedAt?: string;
  tags?: string[];
  notes?: string[];
}

export interface MacroAgriEmbedInput {
  enabled: boolean;
  status?: EmbedAvailabilityStatus;
  providerName: string;
  title?: string;
  embedUrl?: string;
  externalUrl?: string;
  suggestedHeightPx?: number;
  aspectRatio?: string;
  notes?: string[];
}

export interface MacroAgriIndicesBuilderInput {
  widgetId?: string;
  title?: string;
  subtitle?: string;
  status?: GrainWidgetStatus;
  sourceName: string;
  sourceAttribution?: string;
  sourceUrl?: string;
  updatedAt: string;
  asOf?: string;
  timeframe?: "1d" | "7d";
  notes?: string[];
  fallbackReason?: string;
  renderMode: MacroAgriRenderMode;
  items?: MacroAgriRawItem[];
  cards?: GrainWidgetStatCard[];
  embed?: MacroAgriEmbedInput;
  fx?: FxSnapshot;
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

function buildPriceLikeItem(raw: MacroAgriRawItem, fx?: FxSnapshot): GrainWidgetMacroAgriIndexItem {
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
    id: raw.id,
    label: raw.label,
    sublabel: raw.sublabel,
    region: raw.region,
    metricSemanticKind: "price",
    status: raw.status,
    price: {
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
    },
    series: raw.series,
    sourceName: raw.sourceName,
    sourceAttribution: raw.sourceAttribution,
    updatedAt: raw.updatedAt,
    tags: raw.tags,
    notes: raw.notes,
  };
}

function buildIndexLikeItem(raw: MacroAgriRawItem): GrainWidgetMacroAgriIndexItem {
  return {
    id: raw.id,
    label: raw.label,
    sublabel: raw.sublabel,
    region: raw.region,
    metricSemanticKind: raw.metricSemanticKind,
    status: raw.status,
    valueCurrent: raw.valueCurrent,
    valueChange: raw.valueChange,
    valueChangePct: raw.valueChangePct,
    unitLabel: raw.unitLabel ?? raw.unit ?? "pts",
    valueLabel: raw.valueLabel,
    series: raw.series,
    sourceName: raw.sourceName,
    sourceAttribution: raw.sourceAttribution,
    updatedAt: raw.updatedAt,
    tags: raw.tags,
    notes: raw.notes,
  };
}

function deriveMomentumLabel(items: GrainWidgetMacroAgriIndexItem[]): "Firm" | "Soft" | "Mixed" | "Flat" | "Unavailable" {
  const pctValues = items
    .map((item) =>
      item.metricSemanticKind === "price"
        ? item.price?.normalizedValueChangePct ?? item.price?.nativeValueChangePct
        : item.valueChangePct,
    )
    .filter((value): value is number => typeof value === "number");
  if (!pctValues.length) return "Unavailable";
  const avg = pctValues.reduce((a, b) => a + b, 0) / pctValues.length;
  if (Math.abs(avg) < 0.15) return "Flat";
  if (avg > 0.4) return "Firm";
  if (avg < -0.4) return "Soft";
  return "Mixed";
}

export function buildMacroAgriIndicesWidget(input: MacroAgriIndicesBuilderInput): GrainWidgetMacroAgriIndices {
  const items = input.items?.map((raw) => (raw.metricSemanticKind === "price" ? buildPriceLikeItem(raw, input.fx) : buildIndexLikeItem(raw)));
  const statuses = (items || []).map((item) => item.status).filter((value): value is GrainWidgetStatus => Boolean(value));
  const status =
    input.status ??
    (statuses.length ? pickWorstStatus(statuses) : input.renderMode === "fallback" ? "FALLBACK" : "OFFLINE");

  const metricCoverage = { priceLikeItems: 0, indexItems: 0, compositeItems: 0, signalItems: 0 };
  for (const item of items || []) {
    if (item.metricSemanticKind === "price") metricCoverage.priceLikeItems += 1;
    else if (item.metricSemanticKind === "index") metricCoverage.indexItems += 1;
    else if (item.metricSemanticKind === "composite") metricCoverage.compositeItems += 1;
    else if (item.metricSemanticKind === "signal") metricCoverage.signalItems += 1;
  }

  const embed = input.embed
    ? {
        enabled: input.embed.enabled,
        status: input.embed.status ?? (input.embed.enabled ? "AVAILABLE" : "DISABLED"),
        providerName: input.embed.providerName,
        title: input.embed.title,
        embedUrl: input.embed.embedUrl,
        externalUrl: input.embed.externalUrl,
        suggestedHeightPx: input.embed.suggestedHeightPx ?? 280,
        aspectRatio: input.embed.aspectRatio ?? "16/9",
        notes: input.embed.notes,
      }
    : undefined;

  let modeReason: string | undefined;
  if (input.renderMode === "embed" && embed?.status === "BLOCKED") {
    modeReason = "Embed blocked by iframe policy, use external source fallback.";
  } else if (input.renderMode === "fallback") {
    modeReason = input.fallbackReason ?? "Using fallback widget payload";
  }

  return {
    id: input.widgetId ?? "grain-macro-agri-indices",
    kind: "MACRO_AGRI_INDICES",
    title: input.title ?? "Macro Agri Indices",
    subtitle: input.subtitle ?? "Global agri/grain macro index layer",
    status,
    sourceName: input.sourceName,
    sourceAttribution: input.sourceAttribution,
    sourceUrl: input.sourceUrl,
    updatedAt: input.updatedAt,
    asOf: input.asOf,
    timeframe: input.timeframe,
    notes: input.notes,
    fallbackReason: input.fallbackReason,
    renderMode: input.renderMode,
    items,
    cards: input.cards,
    embed,
    summary: {
      itemCount: items?.length ?? 0,
      momentumLabel: items?.length ? deriveMomentumLabel(items) : "Unavailable",
      renderMode: input.renderMode,
      modeReason,
      metricCoverage,
    },
  };
}
