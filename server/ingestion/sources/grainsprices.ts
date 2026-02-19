import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF: ProviderDefinition = {
  vendor: "GRAINSPRICES",
  channel: "HTML_PAGE",
  market: "US",
  commodityHint: "corn",
  basis: "FOB reference",
  url: "https://grainsprices.com/markets/fob",
  parserSpec: { dateKeywords: ["fob", "markets"], priceKeywords: ["corn", "wheat", "soy"], currencyHint: "USD", unitHint: "t" },
};

export async function fetchGrainsPrices(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF, layer);
}

export function listGrainsPricesDefinitions(): ProviderDefinition[] {
  return [DEF];
}
