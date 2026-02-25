import type { GrainWidgetPoint, GrainWidgetStatus } from "../types";
import type { LivestockFeedRawRow } from "../builders/livestockTieInBuilder";
import type { MacroAgriEmbedInput, MacroAgriRawItem } from "../builders/macroAgriIndicesBuilder";

function nowIso() {
  return new Date().toISOString();
}

function makeSeries(values: number[], stepHours = 24): GrainWidgetPoint[] {
  const len = values.length;
  return values.map((value, i) => ({
    ts: new Date(Date.now() - (len - 1 - i) * stepHours * 3600_000).toISOString(),
    value,
  }));
}

function pickStatus(kind: "fresh" | "indicative" | "fallback" | "offline"): GrainWidgetStatus {
  if (kind === "fresh") return "REFRESH";
  if (kind === "indicative") return "INDICATIVE";
  if (kind === "fallback") return "FALLBACK";
  return "OFFLINE";
}

export interface MockLivestockTieInOptions {
  statusMode?: "fresh" | "indicative" | "fallback" | "offline";
  includeCornFeed?: boolean;
  includeFxSensitiveRow?: boolean;
  partialMode?: boolean;
  sourceName?: string;
  sourceAttribution?: string;
}

export function mockLivestockTieInWidgetRaw(opts: MockLivestockTieInOptions = {}): LivestockFeedRawRow[] {
  const {
    statusMode = "fallback",
    includeCornFeed = true,
    includeFxSensitiveRow = false,
    partialMode = false,
    sourceName = "Commoditic",
    sourceAttribution = "Data: Commoditic",
  } = opts;
  const status = pickStatus(statusMode);
  const updatedAt = nowIso();

  const rows: LivestockFeedRawRow[] = [
    {
      id: "livestock-soy-meal",
      label: "Soy Meal",
      sublabel: "Feed ingredient benchmark",
      region: "Global",
      valueCurrent: 372.4,
      valueChange: 4.1,
      valueChangePct: 1.11,
      currency: "USD",
      unit: "USD/t",
      nativeUnitType: "USD_PER_TON",
      sourceName,
      sourceAttribution,
      updatedAt,
      status,
      metricSemanticKind: "price",
      tags: ["oilseeds", "meal", "feed"],
      notes: statusMode === "fallback" ? ["Mock fallback row"] : undefined,
    },
  ];

  if (includeCornFeed) {
    rows.push({
      id: "livestock-corn-feed",
      label: "Corn Feed",
      sublabel: "Feed-side proxy",
      region: "Global",
      valueCurrent: partialMode ? undefined : 228.6,
      valueChange: partialMode ? undefined : -1.8,
      valueChangePct: partialMode ? undefined : -0.78,
      currency: "USD",
      unit: "USD/t",
      nativeUnitType: "USD_PER_TON",
      sourceName,
      sourceAttribution,
      updatedAt,
      status: partialMode ? "OFFLINE" : status,
      metricSemanticKind: "price",
      tags: ["corn", "feed"],
      notes: partialMode ? ["Value unavailable in partial mock mode"] : undefined,
    });
  }

  rows.push({
    id: "livestock-feed-wheat-proxy",
    label: "Feed Wheat (Proxy)",
    sublabel: "Feed grain proxy",
    region: "Europe",
    valueCurrent: 201.9,
    valueChange: 2.3,
    valueChangePct: 1.15,
    currency: "USD",
    unit: "USD/t",
    nativeUnitType: "USD_PER_TON",
    sourceName,
    sourceAttribution,
    updatedAt,
    status,
    metricSemanticKind: "price",
    tags: ["wheat", "feed", "proxy"],
    notes: ["Proxy metric for demo visualization"],
  });

  if (includeFxSensitiveRow) {
    rows.push({
      id: "livestock-rapemeal-eu",
      label: "Rapeseed Meal (EU)",
      sublabel: "Oilseed meal regional marker",
      region: "Europe",
      valueCurrent: 298.5,
      valueChange: 1.9,
      valueChangePct: 0.64,
      currency: "EUR",
      unit: "EUR/t",
      nativeUnitType: "EUR_PER_TON",
      sourceName,
      sourceAttribution,
      updatedAt,
      status,
      metricSemanticKind: "price",
      tags: ["rapeseed", "meal", "europe"],
      notes: ["Useful to test EUR->USD normalization / FX_MISSING fallback"],
    });
  }

  return rows;
}

export interface MockMacroAgriIndicesOptions {
  statusMode?: "fresh" | "indicative" | "fallback" | "offline";
  renderMode?: "api_series" | "embed" | "fallback";
  includePriceLikeItem?: boolean;
  includeEmbedConfig?: boolean;
  embedBlocked?: boolean;
  partialMode?: boolean;
  sourceName?: string;
  sourceAttribution?: string;
}

export function mockMacroAgriIndicesRaw(opts: MockMacroAgriIndicesOptions = {}): {
  items: MacroAgriRawItem[];
  cards: Array<{
    id: string;
    label: string;
    value?: number;
    valueText?: string;
    delta?: number;
    deltaPct?: number;
    status?: GrainWidgetStatus;
    series?: GrainWidgetPoint[];
    notes?: string[];
  }>;
  embed?: MacroAgriEmbedInput;
} {
  const {
    statusMode = "fallback",
    renderMode = "fallback",
    includePriceLikeItem = true,
    includeEmbedConfig = true,
    embedBlocked = false,
    partialMode = false,
    sourceName = "TradingEconomics",
    sourceAttribution = "Data: TradingEconomics",
  } = opts;

  const status = pickStatus(statusMode);
  const updatedAt = nowIso();

  const items: MacroAgriRawItem[] = [
    {
      id: "macro-agri-global-grain-index",
      label: "Global Grain Index",
      sublabel: "Agri macro proxy",
      region: "Global",
      metricSemanticKind: "index",
      status,
      valueCurrent: 1284.2,
      valueChange: 9.7,
      valueChangePct: 0.76,
      unitLabel: "pts",
      valueLabel: "1,284.2 pts",
      series: makeSeries([1258.1, 1262.4, 1268.0, 1271.9, 1274.8, 1279.3, 1284.2]),
      sourceName,
      sourceAttribution,
      updatedAt,
      tags: ["macro", "grain", "index"],
      notes: statusMode === "fallback" ? ["Mock fallback item"] : undefined,
    },
    {
      id: "macro-agri-oilseeds-index",
      label: "Oilseeds Index",
      sublabel: "Composite oilseeds marker",
      region: "Global",
      metricSemanticKind: "composite",
      status: partialMode ? "OFFLINE" : status,
      valueCurrent: partialMode ? undefined : 1108.6,
      valueChange: partialMode ? undefined : -4.4,
      valueChangePct: partialMode ? undefined : -0.4,
      unitLabel: "pts",
      valueLabel: partialMode ? undefined : "1,108.6 pts",
      series: partialMode ? undefined : makeSeries([1118.2, 1115.4, 1114.0, 1112.7, 1111.5, 1109.8, 1108.6]),
      sourceName,
      sourceAttribution,
      updatedAt,
      tags: ["oilseeds", "composite"],
      notes: partialMode ? ["Unavailable in partial mock mode"] : undefined,
    },
    {
      id: "macro-agri-freight-pressure-signal",
      label: "Freight Pressure Signal",
      sublabel: "Derived macro context",
      region: "Global",
      metricSemanticKind: "signal",
      status,
      valueCurrent: 62,
      valueChange: 3,
      valueChangePct: 5.08,
      unitLabel: "score",
      valueLabel: "62 / 100",
      series: makeSeries([51, 54, 55, 57, 59, 61, 62]),
      sourceName,
      sourceAttribution,
      updatedAt,
      tags: ["freight", "signal", "derived"],
      notes: ["Demo composite signal for UI density"],
    },
  ];

  if (includePriceLikeItem) {
    items.push({
      id: "macro-agri-price-like-wheat-proxy",
      label: "Wheat Price Proxy",
      sublabel: "Macro price-like series",
      region: "Global",
      metricSemanticKind: "price",
      status,
      valueCurrent: 236.8,
      valueChange: 2.2,
      valueChangePct: 0.94,
      currency: "EUR",
      unit: "EUR/t",
      nativeUnitType: "EUR_PER_TON",
      series: makeSeries([231.2, 232.8, 233.5, 234.4, 235.1, 235.8, 236.8]),
      sourceName,
      sourceAttribution,
      updatedAt,
      tags: ["wheat", "price-like", "europe"],
      notes: ["Useful to test mixed index+price widget normalization"],
    });
  }

  const cards = [
    {
      id: "macro-card-grain",
      label: "Grain Macro",
      value: 1284.2,
      delta: 9.7,
      deltaPct: 0.76,
      status,
      series: makeSeries([1258.1, 1262.4, 1268.0, 1271.9, 1274.8, 1279.3, 1284.2]),
    },
    {
      id: "macro-card-oilseeds",
      label: "Oilseeds",
      value: partialMode ? undefined : 1108.6,
      delta: partialMode ? undefined : -4.4,
      deltaPct: partialMode ? undefined : -0.4,
      status: partialMode ? "OFFLINE" : status,
      series: partialMode ? undefined : makeSeries([1118.2, 1115.4, 1114.0, 1112.7, 1111.5, 1109.8, 1108.6]),
      notes: partialMode ? ["Unavailable in partial mock mode"] : undefined,
    },
    {
      id: "macro-card-regime",
      label: "Market Regime",
      valueText: "Mixed",
      status,
      notes: ["Rule-based demo label"],
    },
  ];

  let embed: MacroAgriEmbedInput | undefined;
  if (includeEmbedConfig) {
    embed = {
      enabled: renderMode === "embed",
      status: renderMode !== "embed" ? "DISABLED" : embedBlocked ? "BLOCKED" : "AVAILABLE",
      providerName: "TradingEconomics",
      title: "Global Agri / Grain Macro Chart",
      embedUrl: renderMode === "embed" && !embedBlocked ? "https://api.tradingeconomics.com/embed/historical-chart" : undefined,
      externalUrl: "https://tradingeconomics.com/commodities",
      suggestedHeightPx: 280,
      aspectRatio: "16/9",
      notes:
        renderMode === "embed"
          ? embedBlocked
            ? ["Embed blocked in this mock scenario, UI should render fallback cleanly"]
            : ["Mock embed config for bounded iframe panel"]
          : ["Embed disabled; using api_series/fallback rendering"],
    };
  }

  return { items, cards, embed };
}
