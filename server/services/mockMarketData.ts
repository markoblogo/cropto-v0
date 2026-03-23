/**
 * Mock market data for BR (Brazil), AR (Argentina), and US (USA) countries.
 * This is a temporary solution until real parsers are implemented.
 */

export interface MarketIndexDto {
  seriesKey?: string;
  commodity: string;
  grade: string | null;
  country: "UA" | "BR" | "AR" | "US";
  basis: string;
  price: number;
  currency: "USD";
  change24h: number;
  change7d: number;
  change30d: number;
  asOf: string; // ISO string
  source:
    | "spike_telegram"
    | "mock"
    | "manual"
    | "IGC"
    | "USDA_AMS"
    | "BARCHART_USDA"
    | "FUTURES_PROXY"
    | "CLAL"
    | "GRAINSPRICES"
    | "FSGRAIN"
    | "BCR"
    | "COMMODITY3"
    | "synthetic_model";
  sourceTier?: "primary" | "secondary" | "synthetic" | "last_known";
  dataStatus?: "fresh" | "stale" | "no_recent";
  priceStatus?: "fresh" | "stale" | "missing";
  lastFetchStatus?: "ok" | "failed" | "unknown";
  lastFetchError?: string | null;
  needsReview?: boolean;
  isMockData?: boolean;
  confidence?: "high" | "medium" | "low";
  freshnessDays?: number;
  isStale?: boolean;
  sourceType?: "official_api" | "official_file" | "public_html" | "editorial_article" | "internal";
  usagePolicy?: "open" | "restricted" | "unknown";
  visibility?: "public" | "internal_only";
  fetchedAt?: string;
  provider?: string;
  channel?: string;
  rawCommodity?: string;
  category?: "grain" | "oilseed" | "other";
  rawPrice?: number;
  rawUnit?: string;
  rawCurrency?: string;
  rawToUsdFxRate?: number;
  conversionNotes?: string;
  invalidReason?: string | null;
  alternatives?: Array<{
    provider: string;
    source: string;
    channel?: string;
    asOf: string;
    fetchedAt?: string;
    priceStatus?: string;
    lastFetchStatus?: string;
    sourceTier?: string;
  }>;
  // Optional IGC-specific fields
  dailyChange?: number; // from dailyChangePct (alias for change24h, for backward compatibility)
  annualChange?: number; // from annualChangePct
  low52w?: number;
  high52w?: number;
}

/**
 * Mock market data for Brazil (BR)
 * Note: These are demo placeholders only, used as fallback when IGC parser is unavailable.
 * IGC parser supports: wheat, maize/corn, soybeans, barley, rice (no sugar).
 */
export function getMockMarketDataBR(): MarketIndexDto[] {
  const now = new Date().toISOString();
  return [
    {
      commodity: "soybeans",
      grade: "GMO",
      country: "BR",
      basis: "FOB Santos",
      price: 485.50,
      currency: "USD",
      change24h: 2.3,
      change7d: -1.8,
      change30d: 5.2,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
    {
      commodity: "corn",
      grade: null,
      country: "BR",
      basis: "FOB Santos",
      price: 245.80,
      currency: "USD",
      change24h: 0.5,
      change7d: 1.2,
      change30d: -3.1,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
  ];
}

/**
 * Mock market data for Argentina (AR)
 */
export function getMockMarketDataAR(): MarketIndexDto[] {
  const now = new Date().toISOString();
  return [
    {
      commodity: "soybeans",
      grade: "GMO",
      country: "AR",
      basis: "FOB Up River",
      price: 478.30,
      currency: "USD",
      change24h: 1.5,
      change7d: -2.3,
      change30d: 4.8,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
    {
      commodity: "corn",
      grade: null,
      country: "AR",
      basis: "FOB Up River",
      price: 238.50,
      currency: "USD",
      change24h: -0.3,
      change7d: 0.8,
      change30d: -2.5,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
    {
      commodity: "wheat",
      grade: "12.5pro",
      country: "AR",
      basis: "FOB Up River",
      price: 285.00,
      currency: "USD",
      change24h: 1.2,
      change7d: 3.1,
      change30d: -1.2,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
  ];
}

/**
 * Mock market data for USA (US)
 */
export function getMockMarketDataUS(): MarketIndexDto[] {
  const now = new Date().toISOString();
  return [
    {
      commodity: "corn",
      grade: null,
      country: "US",
      basis: "FOB Gulf",
      price: 250.00,
      currency: "USD",
      change24h: 0.8,
      change7d: 1.5,
      change30d: -2.0,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
    {
      commodity: "wheat",
      grade: null,
      country: "US",
      basis: "FOB Gulf",
      price: 290.00,
      currency: "USD",
      change24h: -0.5,
      change7d: 2.1,
      change30d: 3.5,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
    {
      commodity: "soybeans",
      grade: "GMO",
      country: "US",
      basis: "FOB Gulf",
      price: 495.00,
      currency: "USD",
      change24h: 1.2,
      change7d: -1.0,
      change30d: 4.2,
      asOf: now,
      source: "mock",
      fetchedAt: now,
      provider: "Demo data",
      channel: "HTML_PAGE",
      sourceTier: "secondary",
      dataStatus: "fresh",
      priceStatus: "fresh",
      lastFetchStatus: "unknown",
      isMockData: true,
    },
  ];
}
