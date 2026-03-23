import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF_BY_KEY: Record<string, ProviderDefinition> = {
  US_CORN: {
    vendor: "GRAINSPRICES",
    channel: "HTML_PAGE",
    market: "US",
    commodityHint: "corn",
    basis: "FOB reference",
    url: "https://grainsprices.com/markets/fob",
    parserSpec: { dateKeywords: ["fob", "markets"], priceKeywords: ["corn", "wheat", "soy"], commodityKeywords: ["corn", "maize"], currencyHint: "USD", unitHint: "t" },
  },
  US_WHEAT: {
    vendor: "GRAINSPRICES",
    channel: "HTML_PAGE",
    market: "US",
    commodityHint: "wheat",
    basis: "FOB reference",
    url: "https://grainsprices.com/markets/fob",
    parserSpec: { dateKeywords: ["fob", "markets"], priceKeywords: ["corn", "wheat", "soy"], commodityKeywords: ["wheat"], currencyHint: "USD", unitHint: "t" },
  },
  US_SOY: {
    vendor: "GRAINSPRICES",
    channel: "HTML_PAGE",
    market: "US",
    commodityHint: "soybeans",
    basis: "FOB reference",
    url: "https://grainsprices.com/markets/fob",
    parserSpec: { dateKeywords: ["fob", "markets"], priceKeywords: ["corn", "wheat", "soy"], commodityKeywords: ["soy"], currencyHint: "USD", unitHint: "t" },
  },
};

export async function fetchGrainsPrices(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF_BY_KEY.US_CORN, layer);
}

export function listGrainsPricesDefinitions(): ProviderDefinition[] {
  return Object.values(DEF_BY_KEY);
}
