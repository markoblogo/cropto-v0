/**
 * Mock market data for BR (Brazil) and AR (Argentina) countries.
 * This is a temporary solution until real parsers are implemented.
 */

export interface MarketIndexDto {
  commodity: string;
  grade: string | null;
  country: "UA" | "BR" | "AR";
  basis: string;
  price: number;
  currency: "USD";
  change24h: number;
  change7d: number;
  change30d: number;
  asOf: string; // ISO string
  source: "spike_telegram" | "mock" | "manual";
}

/**
 * Mock market data for Brazil (BR)
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
    },
    {
      commodity: "sugar",
      grade: "Raw",
      country: "BR",
      basis: "FOB Santos",
      price: 520.00,
      currency: "USD",
      change24h: -0.8,
      change7d: 2.1,
      change30d: 8.5,
      asOf: now,
      source: "mock",
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
    },
  ];
}