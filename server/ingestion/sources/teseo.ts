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
    parserSpec: { dateKeywords: ["Rosario", "Corn"], priceKeywords: ["USD", "ARS"], commodityKeywords: ["corn", "maize", "mais"], unitHint: "t" },
  },
  AR_WHEAT: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "AR",
    commodityHint: "wheat",
    basis: "Argentina wheat",
    url: "https://teseo.clal.it/en/?section=argentina_wheat",
    parserSpec: { dateKeywords: ["Wheat"], priceKeywords: ["USD", "ARS"], commodityKeywords: ["wheat"], unitHint: "t" },
  },
  AR_SOY: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "AR",
    commodityHint: "soybeans",
    basis: "Argentina",
    url: "https://teseo.clal.it/en/?section=argentina_soia",
    parserSpec: { dateKeywords: ["Soy"], priceKeywords: ["USD", "ARS"], commodityKeywords: ["soy"], unitHint: "t" },
  },
  BR_CORN: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "BR",
    commodityHint: "corn",
    basis: "Brazil corn",
    url: "https://teseo.clal.it/en/?section=cereals_brazil_prices",
    parserSpec: { dateKeywords: ["Brazil"], priceKeywords: ["BRL", "USD"], commodityKeywords: ["corn", "maize", "milho", "saca"], unitHint: "bag60kg", currencyHint: "BRL" },
  },
  BR_WHEAT: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "BR",
    commodityHint: "wheat",
    basis: "Brazil wheat",
    url: "https://teseo.clal.it/en/?section=cereals_brazil_prices",
    parserSpec: { dateKeywords: ["Brazil"], priceKeywords: ["BRL", "USD"], commodityKeywords: ["wheat", "trigo", "saca"], unitHint: "bag60kg", currencyHint: "BRL" },
  },
  BR_SOY: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "BR",
    commodityHint: "soybeans",
    basis: "Brazil soybeans",
    url: "https://teseo.clal.it/en/?section=cereals_brazil_prices",
    parserSpec: { dateKeywords: ["Brazil"], priceKeywords: ["BRL", "USD"], commodityKeywords: ["soy", "soja", "saca"], unitHint: "bag60kg", currencyHint: "BRL" },
  },
  US_CORN: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "US",
    commodityHint: "corn",
    basis: "US corn",
    url: "https://teseo.clal.it/en/?section=cereals_price_usa",
    parserSpec: { dateKeywords: ["United States"], priceKeywords: ["USD", "bushel"], commodityKeywords: ["corn", "maize"], unitHint: "bu", currencyHint: "USD" },
  },
  US_WHEAT: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "US",
    commodityHint: "wheat",
    basis: "US wheat",
    url: "https://teseo.clal.it/en/?section=cereals_price_usa",
    parserSpec: { dateKeywords: ["United States"], priceKeywords: ["USD", "bushel"], commodityKeywords: ["wheat"], unitHint: "bu", currencyHint: "USD" },
  },
  US_SOY: {
    vendor: "CLAL",
    channel: "TESEO",
    market: "US",
    commodityHint: "soybeans",
    basis: "US soybeans",
    url: "https://teseo.clal.it/en/?section=cereals_price_usa",
    parserSpec: { dateKeywords: ["United States"], priceKeywords: ["USD", "bushel"], commodityKeywords: ["soy"], unitHint: "bu", currencyHint: "USD" },
  },
};

export async function fetchTeseo(key: keyof typeof DEF_BY_KEY, layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF_BY_KEY[key], layer);
}

export function listTeseoDefinitions(): ProviderDefinition[] {
  return Object.values(DEF_BY_KEY);
}
