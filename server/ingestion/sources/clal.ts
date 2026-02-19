import { fetchAndParseProvider } from "./common";
import type { ProviderDefinition, ProviderParseResult, SourceLayer } from "../types";

const CLAL_SOY_AR: ProviderDefinition = {
  vendor: "CLAL",
  channel: "CLAL_MINI_INDEX",
  market: "AR",
  commodityHint: "soybeans",
  basis: "Argentina soy index",
  url: "https://www.clal.it/mini_index.php?locale=en_US&section=storico_prezzi_giornalieri&prodotto=soia_argentina&valuta=ARS&unita=ton&year=2025",
  parserSpec: { dateKeywords: ["storico", "giornalieri"], priceKeywords: ["ARS", "soia"], currencyHint: "ARS", unitHint: "t" },
};

export async function fetchClalSoyAr(layer: SourceLayer): Promise<ProviderParseResult> {
  return fetchAndParseProvider(CLAL_SOY_AR, layer);
}

export function listClalDefinitions(): ProviderDefinition[] {
  return [CLAL_SOY_AR];
}
