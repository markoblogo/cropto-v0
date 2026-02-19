import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF_BY_KEY: Record<string, ProviderDefinition> = {
  AR_CORN: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "AR",
    commodityHint: "corn",
    basis: "Rosario",
    url: "https://teseo.clal.it/en/?section=argentina_mais",
    parserSpec: { dateKeywords: ["Rosario", "Corn"], priceKeywords: ["USD", "ARS"], unitHint: "t" },
  },
  AR_WHEAT: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "AR",
    commodityHint: "wheat",
    basis: "Argentina wheat",
    url: "https://teseo.clal.it/en/?section=argentina_wheat",
    parserSpec: { dateKeywords: ["Wheat"], priceKeywords: ["USD", "ARS"], unitHint: "t" },
  },
  AR_SOY: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "AR",
    commodityHint: "soybeans",
    basis: "Argentina",
    url: "https://teseo.clal.it/en/?section=argentina_soia",
    parserSpec: { dateKeywords: ["Soy"], priceKeywords: ["USD", "ARS"], unitHint: "t" },
  },
  BR_MIXED: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "BR",
    commodityHint: "soybeans",
    basis: "Brazil cereals",
    url: "https://teseo.clal.it/en/?section=cereals_brazil_prices",
    parserSpec: { dateKeywords: ["Brazil"], priceKeywords: ["BRL", "USD"], unitHint: "t" },
  },
  US_MIXED: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "US",
    commodityHint: "soybeans",
    basis: "US cereals",
    url: "https://teseo.clal.it/en/?section=cereals_price_usa",
    parserSpec: { dateKeywords: ["United States"], priceKeywords: ["USD", "bushel"], unitHint: "bu", currencyHint: "USD" },
  },
};

export async function fetchTeseo(key: keyof typeof DEF_BY_KEY, layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF_BY_KEY[key], layer);
}

export function listTeseoDefinitions(): ProviderDefinition[] {
  return Object.values(DEF_BY_KEY);
}
