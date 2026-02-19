export type IngestionMarket = "US" | "AR" | "BR";

export type SourceLayer = "primary" | "fallback";

export type CommodityCategory = "grain" | "oilseed" | "other";

export type MarketPricePoint = {
  market: IngestionMarket;
  commodity: string;
  category: CommodityCategory;
  variant?: string;
  rawCommodity?: string;
  basis?: string;
  unit: "USD/t";
  price: number; // always USD/t
  priceRaw: number;
  rawUnit: string;
  rawCurrency: string;
  rawToUsdFxRate?: number;
  conversionNotes?: string;
  priceUsdPerTon?: number;
  asOf: string; // YYYY-MM-DD
  fetchedAt: string; // ISO
  source: {
    vendor: string;
    channel: string;
    url: string;
    layer: SourceLayer;
    confidence?: number;
  };
  status?: "fresh" | "stale" | "failed";
  needsReview?: boolean;
  raw?: {
    htmlSha?: string;
    payloadSha?: string;
    parser?: string;
  };
};

export type SourceFetchAttempt = {
  vendor: string;
  channel: string;
  market: IngestionMarket;
  commodity: string;
  url: string;
  layer: SourceLayer;
  status: "ok" | "failed";
  statusCode?: number;
  latencyMs?: number;
  error?: string;
  confidence?: number;
  asOf?: string | null;
  fetchedAt: string;
  pointCount: number;
};

export type SourceStatusRow = {
  vendor: string;
  channel: string;
  market: IngestionMarket;
  commodity: string;
  layer: SourceLayer;
  sourceUrl: string;
  lastFetchedAt?: string | null;
  lastSuccessAt?: string | null;
  lastAsOf?: string | null;
  freshnessStatus: "fresh" | "stale" | "failed";
  lastError?: string | null;
  lastLatencyMs?: number | null;
  confidence?: number | null;
};

export interface ProviderParseResult {
  vendor: string;
  channel: string;
  url: string;
  market: IngestionMarket;
  commodityHint: string;
  points: MarketPricePoint[];
  statusCode: number;
  contentType: string;
  hasDate: boolean;
  hasHistory: boolean;
  updateSignal: "daily_likely" | "weekly_or_irregular" | "unknown";
  confidence: number;
  notes: string[];
  latencyMs: number;
}

export type ProviderDefinition = {
  vendor: string;
  channel: string;
  market: IngestionMarket;
  commodityHint: string;
  basis?: string;
  url: string;
  parserSpec?: {
    dateKeywords?: string[];
    priceKeywords?: string[];
    dateRegex?: string;
    priceRegex?: string;
  };
};

export type MarketCommodityConfig = {
  market: IngestionMarket;
  commodity: string;
  category: CommodityCategory;
  basis?: string;
  primaryProvider: string;
  fallbackProviders: string[];
};
