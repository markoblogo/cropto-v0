import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF_BY_KEY: Record<string, ProviderDefinition> = {
  US_CORN: {
    vendor: "FSGRAIN",
    channel: "HTML_PAGE",
    market: "US",
    commodityHint: "corn",
    basis: "USDA cash",
    url: "https://www.fsgrain.com/pages/usdacash.php",
    parserSpec: { dateKeywords: ["USDA"], priceKeywords: ["cash", "corn", "wheat"], commodityKeywords: ["corn", "maize"], currencyHint: "USD", unitHint: "bu" },
  },
  US_WHEAT: {
    vendor: "FSGRAIN",
    channel: "HTML_PAGE",
    market: "US",
    commodityHint: "wheat",
    basis: "USDA cash",
    url: "https://www.fsgrain.com/pages/usdacash.php",
    parserSpec: { dateKeywords: ["USDA"], priceKeywords: ["cash", "corn", "wheat"], commodityKeywords: ["wheat"], currencyHint: "USD", unitHint: "bu" },
  },
  US_SOY: {
    vendor: "FSGRAIN",
    channel: "HTML_PAGE",
    market: "US",
    commodityHint: "soybeans",
    basis: "USDA cash",
    url: "https://www.fsgrain.com/pages/usdacash.php",
    parserSpec: { dateKeywords: ["USDA"], priceKeywords: ["cash", "corn", "wheat"], commodityKeywords: ["soy"], currencyHint: "USD", unitHint: "bu" },
  },
};

export async function fetchFsGrain(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF_BY_KEY.US_CORN, layer);
}

export function listFsGrainDefinitions(): ProviderDefinition[] {
  return Object.values(DEF_BY_KEY);
}
