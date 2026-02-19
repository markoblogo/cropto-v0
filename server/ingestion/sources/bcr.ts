import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const DEF: ProviderDefinition = {
  vendor: "BCR",
  channel: "HTML_PAGE",
  market: "AR",
  commodityHint: "corn",
  basis: "Rosario local",
  url: "https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1",
  parserSpec: { dateKeywords: ["cotizaciones"], priceKeywords: ["maiz", "trigo", "soja"] },
};

export async function fetchBcr(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(DEF, layer);
}

export function listBcrDefinitions(): ProviderDefinition[] {
  return [DEF];
}
