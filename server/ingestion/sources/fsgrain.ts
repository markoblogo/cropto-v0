import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF: ProviderDefinition = {
  vendor: "FSGRAIN",
  channel: "HTML_PAGE",
  market: "US",
  commodityHint: "corn",
  basis: "USDA cash",
  url: "https://www.fsgrain.com/pages/usdacash.php",
  parserSpec: { dateKeywords: ["USDA"], priceKeywords: ["cash", "corn", "wheat"], currencyHint: "USD", unitHint: "bu" },
};

export async function fetchFsGrain(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF, layer);
}

export function listFsGrainDefinitions(): ProviderDefinition[] {
  return [DEF];
}
