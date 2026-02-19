import type { IngestionMarket, MarketCommodityConfig, ProviderDefinition } from "./types";
import { listTeseoDefinitions } from "./sources/teseo";
import { listClalDefinitions } from "./sources/clal";
import { listGrainsPricesDefinitions } from "./sources/grainsprices";
import { listFsGrainDefinitions } from "./sources/fsgrain";
import { listBcrDefinitions } from "./sources/bcr";
import { listCommodity3Definitions } from "./sources/commodity3";

export const DAILY_CRON_UTC = process.env.MARKET_INGESTION_CRON_UTC || "0 6 * * *";

export const MARKET_COMMODITY_CONFIG: MarketCommodityConfig[] = [
  { market: "US", commodity: "corn", category: "grain", basis: "US spot/cash", primaryProvider: "CLAL", fallbackProviders: ["FSGRAIN", "GRAINSPRICES"] },
  { market: "US", commodity: "wheat", category: "grain", basis: "US spot/cash", primaryProvider: "CLAL", fallbackProviders: ["FSGRAIN", "GRAINSPRICES"] },
  { market: "US", commodity: "soybeans", category: "oilseed", basis: "US spot/cash", primaryProvider: "CLAL", fallbackProviders: ["FSGRAIN", "GRAINSPRICES"] },

  { market: "AR", commodity: "corn", category: "grain", basis: "Rosario", primaryProvider: "CLAL", fallbackProviders: ["BCR", "GRAINSPRICES"] },
  { market: "AR", commodity: "wheat", category: "grain", basis: "Argentina", primaryProvider: "CLAL", fallbackProviders: ["BCR", "GRAINSPRICES"] },
  { market: "AR", commodity: "soybeans", category: "oilseed", basis: "Argentina", primaryProvider: "CLAL", fallbackProviders: ["BCR", "GRAINSPRICES"] },

  { market: "BR", commodity: "corn", category: "grain", basis: "FOB Santos", primaryProvider: "CLAL", fallbackProviders: ["COMMODITY3", "GRAINSPRICES"] },
  { market: "BR", commodity: "wheat", category: "grain", basis: "Brazil", primaryProvider: "CLAL", fallbackProviders: ["COMMODITY3", "GRAINSPRICES"] },
  { market: "BR", commodity: "soybeans", category: "oilseed", basis: "Brazil", primaryProvider: "CLAL", fallbackProviders: ["COMMODITY3", "GRAINSPRICES"] },
];

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  ...listTeseoDefinitions(),
  ...listClalDefinitions(),
  ...listGrainsPricesDefinitions(),
  ...listFsGrainDefinitions(),
  ...listBcrDefinitions(),
  ...listCommodity3Definitions(),
];

export function providerDefinitionsFor(provider: string, market: IngestionMarket): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.filter((d) => d.vendor === provider && d.market === market);
}
