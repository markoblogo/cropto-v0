import { GRAIN_MARKETS_SERIES_POINTS, GRAIN_MARKETS_TIMEFRAME_DEFAULT } from "../config";
import { GRAIN_MARKET_INSTRUMENTS } from "../symbols";
import type { GrainMarketInstrumentKey, GrainMarketQuoteNormalized } from "../types";
import type { GrainMarketsProvider, GrainMarketsProviderContext, GrainMarketsProviderResult } from "./types";
import { makeMockSeries } from "./utils";

const MOCK_BASE: Record<GrainMarketInstrumentKey, { value: number; change: number }> = {
  CBOT_CORN: { value: 4.62, change: 0.06 },
  CBOT_WHEAT: { value: 5.78, change: -0.05 },
  CBOT_SOYBEANS: { value: 11.25, change: 0.12 },
  EURONEXT_MILLING_WHEAT: { value: 232.5, change: 2.1 },
  EURONEXT_CORN: { value: 218.7, change: -1.5 },
  EURONEXT_RAPESEED: { value: 473.2, change: 3.8 },
};

export class MockGrainMarketsProvider implements GrainMarketsProvider {
  id = "mock-grain-markets";
  providerType = "mock";
  enabled = true;

  supports(_instrumentKey: GrainMarketInstrumentKey): boolean {
    return true;
  }

  async getQuotes(
    instrumentKeys: GrainMarketInstrumentKey[],
    ctx: GrainMarketsProviderContext,
  ): Promise<GrainMarketsProviderResult> {
    const quotes: GrainMarketQuoteNormalized[] = instrumentKeys.map((key) => {
      const meta = GRAIN_MARKET_INSTRUMENTS[key];
      const base = MOCK_BASE[key];
      const pct = base.value !== 0 ? Number(((base.change / base.value) * 100).toFixed(2)) : undefined;
      return {
        ...meta,
        status: "FALLBACK",
        sourceName: "Demo sample",
        sourceAttribution: "Fallback sample data (source unavailable)",
        sourceUrl:
          meta.venue === "CBOT"
            ? "https://www.cmegroup.com/markets/agriculture.html"
            : "https://live.euronext.com/en/markets/commodities",
        updatedAt: ctx.now.toISOString(),
        timeframe: GRAIN_MARKETS_TIMEFRAME_DEFAULT,
        valueCurrent: base.value,
        valueChange: base.change,
        valueChangePct: pct,
        series: makeMockSeries(base.value, Math.max(0.04, Math.abs(base.change) * 0.7), GRAIN_MARKETS_SERIES_POINTS),
        fallbackReason: "mock_provider",
        providerId: this.id,
      };
    });

    return {
      providerId: this.id,
      quotes,
      partial: false,
    };
  }
}
