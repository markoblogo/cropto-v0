import {
  ENABLE_EURONEXT_WEB,
  EURONEXT_SOURCE_URL,
  EURONEXT_WEBSERVICES_URL,
  GRAIN_MARKETS_FETCH_TIMEOUT_MS,
  GRAIN_MARKETS_SERIES_POINTS,
  GRAIN_MARKETS_TIMEFRAME_DEFAULT,
} from "../config";
import { GRAIN_MARKET_INSTRUMENTS } from "../symbols";
import type { GrainMarketInstrumentKey, GrainMarketQuoteNormalized } from "../types";
import type { GrainMarketsProvider, GrainMarketsProviderContext, GrainMarketsProviderResult } from "./types";
import { deriveSeriesFromLast, fetchTextWithTimeout, normalizeDate, parseNumber, statusFromSource } from "./utils";

const E_KEY_MATCH: Array<{ key: GrainMarketInstrumentKey; aliases: string[] }> = [
  { key: "EURONEXT_MILLING_WHEAT", aliases: ["milling wheat", "wheat", "ebm"] },
  { key: "EURONEXT_CORN", aliases: ["corn", "maize", "ema"] },
  { key: "EURONEXT_RAPESEED", aliases: ["rapeseed", "canola", "eco"] },
];

function flatten(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.results)) return input.results;
  if (Array.isArray(input.data)) return input.data;
  if (Array.isArray(input.instruments)) return input.instruments;
  return [input];
}

function rowSymbol(row: any): string {
  return String(row?.symbol || row?.code || row?.isin || row?.mnemo || row?.instrument || "").toLowerCase();
}

function parsePayload(raw: string): any[] {
  try {
    return flatten(JSON.parse(raw));
  } catch {
    return [];
  }
}

export class EuronextWebProvider implements GrainMarketsProvider {
  id = "euronext-web";
  providerType = "euronext-web";
  enabled = ENABLE_EURONEXT_WEB;

  supports(instrumentKey: GrainMarketInstrumentKey): boolean {
    return instrumentKey.startsWith("EURONEXT_");
  }

  async getQuotes(
    instrumentKeys: GrainMarketInstrumentKey[],
    ctx: GrainMarketsProviderContext,
  ): Promise<GrainMarketsProviderResult> {
    if (!EURONEXT_WEBSERVICES_URL) {
      throw new Error("euronext_webservices_url_missing");
    }

    const raw = await fetchTextWithTimeout(EURONEXT_WEBSERVICES_URL, GRAIN_MARKETS_FETCH_TIMEOUT_MS);
    const rows = parsePayload(raw);

    const quotes: GrainMarketQuoteNormalized[] = [];

    for (const conf of E_KEY_MATCH) {
      if (!instrumentKeys.includes(conf.key)) continue;
      const row = rows.find((candidate) => {
        const symbol = rowSymbol(candidate);
        return conf.aliases.some((alias) => symbol.includes(alias));
      });

      const meta = GRAIN_MARKET_INSTRUMENTS[conf.key];
      const current = parseNumber(row?.last ?? row?.lastPrice ?? row?.price ?? row?.close);
      const change = parseNumber(row?.change ?? row?.netChange ?? row?.delta);
      const pct = parseNumber(row?.changePercent ?? row?.percentChange ?? row?.pctChange);

      quotes.push({
        ...meta,
        status: statusFromSource({ primary: true, hasValue: current != null, delayed: true }),
        sourceName: "Euronext Web Services",
        sourceAttribution: "Data: Euronext web JSON polling (demo, no websocket)",
        sourceUrl: EURONEXT_SOURCE_URL,
        updatedAt: normalizeDate(row?.updatedAt ?? row?.timestamp ?? row?.time) || ctx.now.toISOString(),
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        valueCurrent: current,
        valueChange: change,
        valueChangePct: pct,
        series: current != null ? deriveSeriesFromLast(current, change, GRAIN_MARKETS_SERIES_POINTS) : [],
        providerId: this.id,
      });
    }

    return {
      providerId: this.id,
      quotes,
      partial: quotes.length !== instrumentKeys.length,
      errors: quotes.length !== instrumentKeys.length ? [{ message: "partial_euronext_coverage" }] : undefined,
    };
  }
}
