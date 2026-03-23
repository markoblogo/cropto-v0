import type {
  GrainMarketInstrumentKey,
  GrainMarketQuoteNormalized,
  GrainMarketTimeframe,
} from "../types";

export interface GrainMarketsProviderContext {
  timeframe: GrainMarketTimeframe;
  seriesPoints: number;
  now: Date;
}

export interface GrainMarketsProviderResult {
  providerId: string;
  quotes: GrainMarketQuoteNormalized[];
  errors?: Array<{
    instrumentKey?: GrainMarketInstrumentKey;
    message: string;
  }>;
  partial?: boolean;
}

export interface GrainMarketsProvider {
  id: string;
  enabled: boolean;
  providerType: string;
  supports(instrumentKey: GrainMarketInstrumentKey): boolean;
  getQuotes(
    instrumentKeys: GrainMarketInstrumentKey[],
    ctx: GrainMarketsProviderContext,
  ): Promise<GrainMarketsProviderResult>;
}
