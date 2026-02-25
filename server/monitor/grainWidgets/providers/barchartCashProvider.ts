import {
  BARCHART_ALLOW_NO_KEY,
  BARCHART_API_KEY,
  BARCHART_CASH_SYMBOLS,
  BARCHART_CASH_URL,
  ENABLE_BARCHART_CASH_WIDGETS,
  GRAIN_WIDGETS_FETCH_TIMEOUT_MS,
} from "../config";
import type { GrainWidgetTableRow, GrainWidgetUSCashBids } from "../types";
import type { GrainWidgetsProvider, GrainWidgetsProviderContext } from "./types";
import { MockGrainWidgetsProvider } from "./mockGrainWidgetsProvider";
import { fetchTextWithTimeout, normalizeDate, normalizeRowPrice, parseNumber, statusFromAvailability } from "./utils";

type BarchartQuote = {
  symbol?: string;
  name?: string;
  lastPrice?: number | string;
  close?: number | string;
  netChange?: number | string;
  percentChange?: number | string;
  tradeTimestamp?: string | number;
  serverTimestamp?: string | number;
};

const SYMBOL_MAP: Record<string, { label: string; crop: "corn" | "wheat" | "soybeans"; region: string; commodityGroup: "Grains" | "Oilseeds" }> = {
  "ZC*1": { label: "Corn", crop: "corn", region: "US Midwest", commodityGroup: "Grains" },
  "ZW*1": { label: "Wheat", crop: "wheat", region: "US Plains", commodityGroup: "Grains" },
  "ZS*1": { label: "Soybeans", crop: "soybeans", region: "US Gulf", commodityGroup: "Oilseeds" },
};

function coverage(rows: GrainWidgetTableRow[]) {
  return {
    ok: rows.filter((row) => row.price?.normalizationStatus === "OK").length,
    partial: rows.filter((row) => row.price?.normalizationStatus === "PARTIAL").length,
    fxMissing: rows.filter((row) => row.price?.normalizationStatus === "FX_MISSING").length,
    unavailable: rows.filter((row) => row.price?.normalizationStatus === "UNAVAILABLE" || !row.price?.normalizationStatus).length,
  };
}

export class BarchartCashProvider implements GrainWidgetsProvider {
  id = "barchart-cash";
  kind = "US_CASH_BIDS" as const;
  enabled = ENABLE_BARCHART_CASH_WIDGETS;
  private readonly fallback = new MockGrainWidgetsProvider({ kind: "US_CASH_BIDS" });

  async getWidget(ctx: GrainWidgetsProviderContext): Promise<GrainWidgetUSCashBids> {
    const hasApiKeyInUrl = BARCHART_CASH_URL.toLowerCase().includes("apikey=");
    if (!BARCHART_API_KEY && !hasApiKeyInUrl && !BARCHART_ALLOW_NO_KEY) throw new Error("barchart_api_key_missing");
    const params = new URLSearchParams({
      symbols: BARCHART_CASH_SYMBOLS,
      fields: "symbol,name,lastPrice,close,netChange,percentChange,tradeTimestamp,serverTimestamp",
    });
    if (BARCHART_API_KEY) params.set("apikey", BARCHART_API_KEY);

    const text = await fetchTextWithTimeout(`${BARCHART_CASH_URL}?${params.toString()}`, GRAIN_WIDGETS_FETCH_TIMEOUT_MS);
    const payload = JSON.parse(text) as { results?: BarchartQuote[]; data?: BarchartQuote[] };
    if ((payload as any)?.status?.code && Number((payload as any).status.code) >= 400) {
      throw new Error(`barchart_http_${(payload as any).status.code}`);
    }
    const quotes = payload.results || payload.data || [];

    const rows: GrainWidgetTableRow[] = [];
    for (const quote of quotes) {
      const symbol = String(quote.symbol || "").toUpperCase();
      const conf = SYMBOL_MAP[symbol];
      if (!conf) continue;
      const valueCurrent = parseNumber(quote.lastPrice) ?? parseNumber(quote.close);
      const valueChange = parseNumber(quote.netChange);
      const valueChangePct = parseNumber(quote.percentChange);

      const row = normalizeRowPrice({
        row: {
          id: `cash-${symbol.toLowerCase()}`,
          label: conf.label,
          region: conf.region,
          commodityGroup: conf.commodityGroup,
          status: statusFromAvailability({ hasValue: valueCurrent != null, indicative: true }),
          sourceName: "Barchart",
          sourceAttribution: "Data: Barchart",
          updatedAt: normalizeDate(quote.tradeTimestamp) || normalizeDate(quote.serverTimestamp) || ctx.now.toISOString(),
          price: {
            nativeValueCurrent: valueCurrent,
            nativeValueChange: valueChange,
            nativeValueChangePct: valueChangePct,
            nativeCurrency: "USD",
            nativeUnit: "c/bu",
            normalizationStatus: "UNAVAILABLE",
          },
        },
        eurUsd: ctx.eurUsd,
        crop: conf.crop,
        nativeUnitType: "CENTS_PER_BUSHEL",
      });
      rows.push(row);
    }

    const values = rows.map((row) => row.price?.normalizedValueCurrent).filter((v): v is number => typeof v === "number");
    const available = rows.filter((row) => row.price?.nativeValueCurrent != null).length;
    return {
      id: "grain-us-cash-bids",
      kind: "US_CASH_BIDS",
      title: "Cash (US)",
      subtitle: "USDA cash grains / regional bids",
      status: available ? (available >= 3 ? "REFRESH" : "INDICATIVE") : "OFFLINE",
      sourceName: "Barchart",
      sourceAttribution: "Data: Barchart",
      sourceUrl: "https://www.barchart.com/ondemand/api/getQuote",
      updatedAt: ctx.now.toISOString(),
      timeframe: ctx.timeframe,
      rows,
      summary: {
        rowCount: rows.length,
        normalizedCoverage: coverage(rows),
        spreadCue: values.length
          ? {
              min: Math.min(...values),
              max: Math.max(...values),
              range: Number((Math.max(...values) - Math.min(...values)).toFixed(2)),
              unit: "USD/t",
              label: "Bid range",
            }
          : undefined,
      },
      notes: [
        ...(rows.length < 3 ? [`${rows.length}/3 instruments available`] : []),
        ...(!BARCHART_API_KEY && hasApiKeyInUrl ? ["API key loaded from URL configuration"] : []),
        ...(!BARCHART_API_KEY && !hasApiKeyInUrl ? ["No API key configured; public/anonymous mode attempted"] : []),
      ].filter(Boolean),
    };
  }

  mockFallback(reason: string, ctx: GrainWidgetsProviderContext): GrainWidgetUSCashBids {
    return this.fallback.mockFallback(reason, ctx) as GrainWidgetUSCashBids;
  }
}
