import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF_BY_KEY: Record<string, ProviderDefinition> = {
  BR_FOB_SANTOS: {
    vendor: "COMMODITY3",
    channel: "HTML_PAGE",
    market: "BR",
    commodityHint: "corn",
    basis: "FOB Santos",
    url: "https://www.commodity3.com/instrument/YC20PPF6/corn-brazil-fob-santos",
    parserSpec: { dateKeywords: ["santos"], priceKeywords: ["corn", "basis"], currencyHint: "USD", unitHint: "t" },
  },
  BR_FOB_BASIS: {
    vendor: "COMMODITY3",
    channel: "HTML_PAGE",
    market: "BR",
    commodityHint: "corn",
    basis: "FOB basis",
    url: "https://www.commodity3.com/instrument/YC2BPPF7/corn-brazil-fob-basis",
    parserSpec: { dateKeywords: ["basis"], priceKeywords: ["corn", "fob"], currencyHint: "USD", unitHint: "t" },
  },
};

export async function fetchCommodity3(key: keyof typeof DEF_BY_KEY, layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF_BY_KEY[key], layer);
}

export function listCommodity3Definitions(): ProviderDefinition[] {
  return Object.values(DEF_BY_KEY);
}
