import type { IngestionMarket, MarketPricePoint } from "../types";

type CommodityRange = { min: number; max: number };

const DEFAULT_RANGE: CommodityRange = { min: 40, max: 2500 };

const RANGES: Record<string, CommodityRange> = {
  corn: { min: 100, max: 600 },
  wheat: { min: 100, max: 700 },
  soybeans: { min: 180, max: 1000 },
  soymeal: { min: 120, max: 1200 },
  sunflower: { min: 150, max: 1400 },
  rapeseed: { min: 150, max: 1400 },
  barley: { min: 80, max: 500 },
  rice: { min: 120, max: 1500 },
};

const MARKET_OVERRIDES: Partial<Record<IngestionMarket, Partial<Record<string, CommodityRange>>>> = {
  BR: {
    soybeans: { min: 180, max: 950 },
  },
  AR: {
    soybeans: { min: 160, max: 950 },
  },
  US: {
    soybeans: { min: 180, max: 950 },
  },
};

export type PriceSanityResult = {
  valid: boolean;
  invalidReason?: "OUT_OF_RANGE" | "INVALID_NUMBER";
  range: CommodityRange;
};

export function validateUsdPerTon(point: Pick<MarketPricePoint, "market" | "commodity" | "price">): PriceSanityResult {
  const value = Number(point.price);
  if (!Number.isFinite(value) || value <= 0) {
    return { valid: false, invalidReason: "INVALID_NUMBER", range: DEFAULT_RANGE };
  }
  const byMarket = MARKET_OVERRIDES[point.market]?.[point.commodity];
  const range = byMarket || RANGES[point.commodity] || DEFAULT_RANGE;
  if (value < range.min || value > range.max) {
    return { valid: false, invalidReason: "OUT_OF_RANGE", range };
  }
  return { valid: true, range };
}
