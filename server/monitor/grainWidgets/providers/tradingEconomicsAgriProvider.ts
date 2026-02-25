import {
  ENABLE_MACRO_AGRI_INDICES_WIDGETS,
  ENABLE_TRADINGECONOMICS_API,
  ENABLE_TRADINGECONOMICS_EMBED,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
  TRADINGECONOMICS_API_KEY,
  TRADINGECONOMICS_API_URL,
  TRADINGECONOMICS_EMBED_URL,
  TRADINGECONOMICS_SOURCE_URL,
} from "../config";
import { buildMacroAgriIndicesWidget, type MacroAgriRawItem } from "../builders/macroAgriIndicesBuilder";
import type { GrainWidgetMacroAgriIndices } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, normalizeDate, parseNumber } from "./utils";

type TeRow = {
  symbol?: string;
  ticker?: string;
  name?: string;
  category?: string;
  region?: string;
  value?: number | string;
  price?: number | string;
  latest?: number | string;
  close?: number | string;
  previousClose?: number | string;
  change?: number | string;
  changePct?: number | string;
  unit?: string;
  currency?: string;
  updatedAt?: string | number;
  date?: string | number;
};

function flatten(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function rowText(row: TeRow): string {
  return `${row.symbol || ""} ${row.ticker || ""} ${row.name || ""} ${row.category || ""}`.toLowerCase();
}

function buildIndexItem(id: string, label: string, row?: TeRow): MacroAgriRawItem {
  const current = parseNumber(row?.value ?? row?.latest ?? row?.price ?? row?.close);
  const change = parseNumber(row?.change);
  const pct = parseNumber(row?.changePct);
  return {
    id,
    label,
    sublabel: "TradingEconomics",
    region: String(row?.region || "Global"),
    metricSemanticKind: "index",
    status: current != null ? "REFRESH" : "OFFLINE",
    valueCurrent: current,
    valueChange: change,
    valueChangePct: pct,
    unitLabel: row?.unit || "pts",
    valueLabel: current != null ? `${current.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row?.unit || "pts"}` : undefined,
    updatedAt: normalizeDate(row?.updatedAt ?? row?.date),
    sourceName: "TradingEconomics",
    sourceAttribution: "Data: TradingEconomics",
    tags: ["macro", "index"],
  };
}

function buildPriceLikeItem(id: string, label: string, row?: TeRow): MacroAgriRawItem {
  const current = parseNumber(row?.value ?? row?.latest ?? row?.price ?? row?.close);
  const previous = parseNumber(row?.previousClose);
  const change = parseNumber(row?.change) ?? (current != null && previous != null ? current - previous : undefined);
  const pct = parseNumber(row?.changePct) ?? (current != null && previous ? ((current - previous) / previous) * 100 : undefined);
  return {
    id,
    label,
    sublabel: "Macro price-like proxy",
    region: String(row?.region || "Global"),
    metricSemanticKind: "price",
    status: current != null ? "INDICATIVE" : "OFFLINE",
    valueCurrent: current,
    valueChange: change,
    valueChangePct: pct,
    currency: String(row?.currency || "EUR"),
    unit: String(row?.unit || "EUR/t"),
    nativeUnitType: String(row?.currency || "").toUpperCase() === "USD" ? "USD_PER_TON" : "EUR_PER_TON",
    updatedAt: normalizeDate(row?.updatedAt ?? row?.date),
    sourceName: "TradingEconomics",
    sourceAttribution: "Data: TradingEconomics",
    tags: ["macro", "price-like"],
  };
}

export class TradingEconomicsAgriProvider implements GrainWidgetsProvider {
  id = "tradingeconomics-agri";
  kind = "MACRO_AGRI_INDICES" as const;
  enabled = ENABLE_MACRO_AGRI_INDICES_WIDGETS;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "MACRO_AGRI_INDICES" });

  private async fetchApiRows(): Promise<any[]> {
    if (!ENABLE_TRADINGECONOMICS_API) throw new Error("tradingeconomics_api_disabled");
    if (!TRADINGECONOMICS_API_URL) throw new Error("tradingeconomics_api_url_missing");
    const headers: HeadersInit = {};
    let url = TRADINGECONOMICS_API_URL;
    if (TRADINGECONOMICS_API_KEY) {
      if (!url.includes("apikey=") && !url.includes("c=")) {
        const separator = url.includes("?") ? "&" : "?";
        url = `${url}${separator}c=${encodeURIComponent(TRADINGECONOMICS_API_KEY)}`;
      }
      headers.authorization = `Bearer ${TRADINGECONOMICS_API_KEY}`;
    }
    const text = await fetchTextWithTimeout(url, GRAIN_WIDGETS_FETCH_TIMEOUT_MS, headers);
    return flatten(JSON.parse(text));
  }

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetMacroAgriIndices> {
    let apiRows: TeRow[] = [];
    let apiError: string | undefined;

    try {
      apiRows = (await this.fetchApiRows()) as TeRow[];
    } catch (error: any) {
      apiError = error?.message || "tradingeconomics_api_failed";
    }

    const findAny = (aliases: string[]) =>
      apiRows.find((row) => aliases.some((alias) => rowText(row).includes(alias)));

    const grainIndex = findAny(["grain", "cereals", "agriculture index", "agri index"]);
    const oilseedIndex = findAny(["oilseed", "oilseeds", "rapeseed", "canola"]);
    const freightSignal = findAny(["freight", "shipping", "baltic", "transport"]);
    const priceLikeWheat = findAny(["wheat", "milling wheat"]);

    const items: MacroAgriRawItem[] = [];
    if (grainIndex) items.push(buildIndexItem("macro-agri-global-grain-index", "Global Grain Index", grainIndex));
    if (oilseedIndex) items.push(buildIndexItem("macro-agri-oilseeds-index", "Oilseeds Index", oilseedIndex));
    if (freightSignal) {
      items.push({
        id: "macro-agri-freight-pressure-signal",
        label: "Freight Pressure Signal",
        sublabel: "Derived macro context",
        region: String(freightSignal.region || "Global"),
        metricSemanticKind: "signal",
        status: "INDICATIVE",
        valueCurrent: parseNumber(freightSignal.value ?? freightSignal.latest ?? freightSignal.price ?? freightSignal.close),
        valueChange: parseNumber(freightSignal.change),
        valueChangePct: parseNumber(freightSignal.changePct),
        unitLabel: "score",
        valueLabel: undefined,
        updatedAt: normalizeDate(freightSignal.updatedAt ?? freightSignal.date),
        sourceName: "TradingEconomics",
        sourceAttribution: "Data: TradingEconomics",
        tags: ["freight", "signal"],
      });
    }
    if (priceLikeWheat) items.push(buildPriceLikeItem("macro-agri-price-like-wheat-proxy", "Wheat Price Proxy", priceLikeWheat));

    if (items.length) {
      return buildMacroAgriIndicesWidget({
        sourceName: "TradingEconomics",
        sourceAttribution: "Data: TradingEconomics",
        sourceUrl: TRADINGECONOMICS_SOURCE_URL,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        status: "REFRESH",
        renderMode: "api_series",
        items,
        cards: [
          {
            id: "macro-card-grain",
            label: "Grain Macro",
            value: items.find((item) => item.id === "macro-agri-global-grain-index")?.valueCurrent,
            deltaPct: items.find((item) => item.id === "macro-agri-global-grain-index")?.valueChangePct,
            status: "REFRESH",
          },
          {
            id: "macro-card-oilseeds",
            label: "Oilseeds",
            value: items.find((item) => item.id === "macro-agri-oilseeds-index")?.valueCurrent,
            deltaPct: items.find((item) => item.id === "macro-agri-oilseeds-index")?.valueChangePct,
            status: "REFRESH",
          },
        ],
        embed: {
          enabled: ENABLE_TRADINGECONOMICS_EMBED,
          status: ENABLE_TRADINGECONOMICS_EMBED ? "AVAILABLE" : "DISABLED",
          providerName: "TradingEconomics",
          title: "Global Agri / Grain Macro Chart",
          embedUrl: ENABLE_TRADINGECONOMICS_EMBED ? TRADINGECONOMICS_EMBED_URL : undefined,
          externalUrl: TRADINGECONOMICS_SOURCE_URL,
          suggestedHeightPx: 280,
          aspectRatio: "16/9",
        },
        fx: { eurUsd: ctx.eurUsd },
        notes: apiError ? [`API recovered with partial data after: ${apiError}`] : undefined,
      });
    }

    if (ENABLE_TRADINGECONOMICS_EMBED) {
      return buildMacroAgriIndicesWidget({
        sourceName: "TradingEconomics",
        sourceAttribution: "Data: TradingEconomics",
        sourceUrl: TRADINGECONOMICS_SOURCE_URL,
        updatedAt: ctx.now.toISOString(),
        timeframe: ctx.timeframe,
        status: "INDICATIVE",
        renderMode: "embed",
        embed: {
          enabled: true,
          status: TRADINGECONOMICS_EMBED_URL ? "AVAILABLE" : "UNAVAILABLE",
          providerName: "TradingEconomics",
          title: "Global Agri / Grain Macro Chart",
          embedUrl: TRADINGECONOMICS_EMBED_URL || undefined,
          externalUrl: TRADINGECONOMICS_SOURCE_URL,
          suggestedHeightPx: 280,
          aspectRatio: "16/9",
          notes: apiError ? [`API unavailable: ${apiError}`] : ["API returned no rows; using embed mode."],
        },
        fallbackReason: apiError || "no_api_rows",
      });
    }

    throw new Error(apiError || "tradingeconomics_no_data");
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetMacroAgriIndices {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetMacroAgriIndices;
  }
}
