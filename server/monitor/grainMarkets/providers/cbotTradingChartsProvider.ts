import {
  ENABLE_CBOT_TRADINGCHARTS_FALLBACK,
  GRAIN_MARKETS_FETCH_TIMEOUT_MS,
  GRAIN_MARKETS_SERIES_POINTS,
  GRAIN_MARKETS_TIMEFRAME_DEFAULT,
  TRADINGCHARTS_CBOT_URL,
} from "../config";
import { GRAIN_MARKET_INSTRUMENTS } from "../symbols";
import type { GrainMarketInstrumentKey, GrainMarketQuoteNormalized } from "../types";
import type { GrainMarketsProvider, GrainMarketsProviderContext, GrainMarketsProviderResult } from "./types";
import { deriveSeriesFromLast, fetchTextWithTimeout, statusFromSource } from "./utils";

type MatchConfig = {
  key: GrainMarketInstrumentKey;
  aliases: string[];
};

const MATCHERS: MatchConfig[] = [
  { key: "CBOT_CORN", aliases: ["corn", "zc"] },
  { key: "CBOT_WHEAT", aliases: ["wheat", "zw", "srw"] },
  { key: "CBOT_SOYBEANS", aliases: ["soybeans", "soy", "zs"] },
];

function parseInstrumentBlock(raw: string, aliases: string[]): { last?: number; change?: number; pct?: number } {
  const lower = raw.toLowerCase();
  let foundIdx = -1;
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx >= 0 && (foundIdx < 0 || idx < foundIdx)) foundIdx = idx;
  }
  if (foundIdx < 0) return {};

  const sample = raw.slice(Math.max(0, foundIdx - 120), Math.min(raw.length, foundIdx + 400));
  const pctMatch = sample.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  const numbers = [...sample.matchAll(/([+-]?\d+(?:\.\d+)?)/g)]
    .map((m) => Number.parseFloat(m[1]))
    .filter((n) => Number.isFinite(n));

  const last = numbers.find((n) => n > 1);
  const change = numbers.find((n) => n !== last && Math.abs(n) < 50);
  const pct = pctMatch ? Number.parseFloat(pctMatch[1]) : undefined;
  return { last, change, pct };
}

export class CbotTradingChartsProvider implements GrainMarketsProvider {
  id = "cbot-tradingcharts";
  providerType = "cbot-tradingcharts";
  enabled = ENABLE_CBOT_TRADINGCHARTS_FALLBACK;

  supports(instrumentKey: GrainMarketInstrumentKey): boolean {
    return instrumentKey.startsWith("CBOT_");
  }

  async getQuotes(
    instrumentKeys: GrainMarketInstrumentKey[],
    ctx: GrainMarketsProviderContext,
  ): Promise<GrainMarketsProviderResult> {
    const html = await fetchTextWithTimeout(TRADINGCHARTS_CBOT_URL, GRAIN_MARKETS_FETCH_TIMEOUT_MS);
    const quotes: GrainMarketQuoteNormalized[] = [];

    for (const matcher of MATCHERS) {
      if (!instrumentKeys.includes(matcher.key)) continue;
      const parsed = parseInstrumentBlock(html, matcher.aliases);
      const meta = GRAIN_MARKET_INSTRUMENTS[matcher.key];

      quotes.push({
        ...meta,
        status: statusFromSource({ primary: false, hasValue: parsed.last != null, delayed: true, fallback: true }),
        sourceName: "TradingCharts",
        sourceAttribution: "Data: TradingCharts public page (indicative fallback)",
        sourceUrl: TRADINGCHARTS_CBOT_URL,
        updatedAt: ctx.now.toISOString(),
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        valueCurrent: parsed.last,
        valueChange: parsed.change,
        valueChangePct: parsed.pct,
        series: parsed.last != null ? deriveSeriesFromLast(parsed.last, parsed.change, GRAIN_MARKETS_SERIES_POINTS) : [],
        fallbackReason: "barchart_unavailable",
        providerId: this.id,
      });
    }

    return {
      providerId: this.id,
      quotes,
      partial: quotes.some((q) => q.valueCurrent == null),
    };
  }
}
