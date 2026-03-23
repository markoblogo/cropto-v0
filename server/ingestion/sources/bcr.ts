import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF_BY_KEY: Record<string, ProviderDefinition> = {
  AR_CORN: {
    vendor: "BCR",
    channel: "HTML_PAGE",
    market: "AR",
    commodityHint: "corn",
    basis: "Rosario local",
    url: "https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1",
    parserSpec: { dateKeywords: ["cotizaciones"], priceKeywords: ["maiz", "trigo", "soja"], commodityKeywords: ["maiz", "maíz", "corn"], currencyHint: "ARS", unitHint: "qq100kg" },
  },
  AR_WHEAT: {
    vendor: "BCR",
    channel: "HTML_PAGE",
    market: "AR",
    commodityHint: "wheat",
    basis: "Rosario local",
    url: "https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1",
    parserSpec: { dateKeywords: ["cotizaciones"], priceKeywords: ["maiz", "trigo", "soja"], commodityKeywords: ["trigo", "wheat"], currencyHint: "ARS", unitHint: "qq100kg" },
  },
  AR_SOY: {
    vendor: "BCR",
    channel: "HTML_PAGE",
    market: "AR",
    commodityHint: "soybeans",
    basis: "Rosario local",
    url: "https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1",
    parserSpec: { dateKeywords: ["cotizaciones"], priceKeywords: ["maiz", "trigo", "soja"], commodityKeywords: ["soja", "soy"], currencyHint: "ARS", unitHint: "qq100kg" },
  },
};

export async function fetchBcr(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF_BY_KEY.AR_CORN, layer);
}

export function listBcrDefinitions(): ProviderDefinition[] {
  return Object.values(DEF_BY_KEY);
}
