import {
  BARCHART_API_KEY,
  BARCHART_CBOT_SYMBOLS,
  BARCHART_QUOTES_URL,
  ENABLE_CBOT_BARCHART,
  GRAIN_MARKETS_FETCH_TIMEOUT_MS,
  GRAIN_MARKETS_SERIES_POINTS,
  GRAIN_MARKETS_TIMEFRAME_DEFAULT,
} from "../config";
import { GRAIN_MARKET_INSTRUMENTS } from "../symbols";
import type { GrainMarketInstrumentKey, GrainMarketQuoteNormalized } from "../types";
import type { GrainMarketsProvider, GrainMarketsProviderContext, GrainMarketsProviderResult } from "./types";
import { deriveSeriesFromLast, fetchTextWithTimeout, normalizeDate, parseNumber, statusFromSource } from "./utils";

type BarchartQuote = {
  symbol?: string;
  lastPrice?: number | string;
  close?: number | string;
  netChange?: number | string;
  percentChange?: number | string;
  tradeTimestamp?: string | number;
  serverTimestamp?: string | number;
};

const SYMBOL_TO_KEY: Record<string, GrainMarketInstrumentKey> = {
  "ZC*1": "CBOT_CORN",
  "ZW*1": "CBOT_WHEAT",
  "ZS*1": "CBOT_SOYBEANS",
};

export class CbotBarchartProvider implements GrainMarketsProvider {
  id = "cbot-barchart";
  providerType = "cbot-barchart";
  enabled = ENABLE_CBOT_BARCHART;

  supports(instrumentKey: GrainMarketInstrumentKey): boolean {
    return instrumentKey.startsWith("CBOT_");
  }

  async getQuotes(
    instrumentKeys: GrainMarketInstrumentKey[],
    ctx: GrainMarketsProviderContext,
  ): Promise<GrainMarketsProviderResult> {
    if (!BARCHART_API_KEY) {
      throw new Error("barchart_api_key_missing");
    }

    const params = new URLSearchParams({
      apikey: BARCHART_API_KEY,
      symbols: BARCHART_CBOT_SYMBOLS,
      fields: "symbol,lastPrice,close,netChange,percentChange,tradeTimestamp,serverTimestamp",
    });

    const text = await fetchTextWithTimeout(`${BARCHART_QUOTES_URL}?${params.toString()}`, GRAIN_MARKETS_FETCH_TIMEOUT_MS);
    const parsed = JSON.parse(text) as { results?: BarchartQuote[] };
    const quotes: GrainMarketQuoteNormalized[] = [];

    for (const row of parsed.results || []) {
      const symbol = String(row.symbol || "").toUpperCase();
      const key = SYMBOL_TO_KEY[symbol];
      if (!key || !instrumentKeys.includes(key)) continue;
      const meta = GRAIN_MARKET_INSTRUMENTS[key];
      const current = parseNumber(row.lastPrice) ?? parseNumber(row.close);
      const change = parseNumber(row.netChange);
      const changePct = parseNumber(row.percentChange);

      quotes.push({
        ...meta,
        status: statusFromSource({ primary: true, hasValue: current != null }),
        sourceName: "Barchart",
        sourceAttribution: "Data: Barchart OnDemand (polling)",
        sourceUrl: "https://www.barchart.com/ondemand/api/getQuote",
        updatedAt: normalizeDate(row.tradeTimestamp) || normalizeDate(row.serverTimestamp) || ctx.now.toISOString(),
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        valueCurrent: current,
        valueChange: change,
        valueChangePct: changePct,
        series: current != null ? deriveSeriesFromLast(current, change, GRAIN_MARKETS_SERIES_POINTS) : [],
        providerId: this.id,
      });
    }

    return {
      providerId: this.id,
      quotes,
      partial: quotes.length !== instrumentKeys.length,
      errors: quotes.length !== instrumentKeys.length ? [{ message: "partial_cbot_barchart_coverage" }] : undefined,
    };
  }
}
