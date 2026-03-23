import type { GrainMarketInstrumentKey, GrainMarketInstrumentMeta } from "./types";

export const GRAIN_MARKET_INSTRUMENTS: Record<GrainMarketInstrumentKey, GrainMarketInstrumentMeta> = {
  CBOT_CORN: {
    key: "CBOT_CORN",
    venue: "CBOT",
    displayName: "CBOT Corn",
    shortName: "Corn",
    commodityGroup: "Grains",
    currency: "USD",
    unit: "USD/bu",
    sourceInstrumentId: "ZC*1",
    updateCadenceHint: "intraday/delayed",
  },
  CBOT_WHEAT: {
    key: "CBOT_WHEAT",
    venue: "CBOT",
    displayName: "CBOT Wheat",
    shortName: "Wheat",
    commodityGroup: "Grains",
    currency: "USD",
    unit: "USD/bu",
    sourceInstrumentId: "ZW*1",
    updateCadenceHint: "intraday/delayed",
  },
  CBOT_SOYBEANS: {
    key: "CBOT_SOYBEANS",
    venue: "CBOT",
    displayName: "CBOT Soybeans",
    shortName: "Soybeans",
    commodityGroup: "Oilseeds",
    currency: "USD",
    unit: "USD/bu",
    sourceInstrumentId: "ZS*1",
    updateCadenceHint: "intraday/delayed",
  },
  EURONEXT_MILLING_WHEAT: {
    key: "EURONEXT_MILLING_WHEAT",
    venue: "EURONEXT",
    displayName: "Euronext Milling Wheat",
    shortName: "Milling Wheat",
    commodityGroup: "Grains",
    currency: "EUR",
    unit: "EUR/t",
    sourceInstrumentId: "EBM",
    updateCadenceHint: "session/delayed",
  },
  EURONEXT_CORN: {
    key: "EURONEXT_CORN",
    venue: "EURONEXT",
    displayName: "Euronext Corn",
    shortName: "Corn",
    commodityGroup: "Grains",
    currency: "EUR",
    unit: "EUR/t",
    sourceInstrumentId: "EMA",
    updateCadenceHint: "session/delayed",
  },
  EURONEXT_RAPESEED: {
    key: "EURONEXT_RAPESEED",
    venue: "EURONEXT",
    displayName: "Euronext Rapeseed",
    shortName: "Rapeseed",
    commodityGroup: "Oilseeds",
    currency: "EUR",
    unit: "EUR/t",
    sourceInstrumentId: "ECO",
    updateCadenceHint: "session/delayed",
  },
};

export const DEFAULT_GRAIN_MARKET_INSTRUMENT_ORDER: GrainMarketInstrumentKey[] = [
  "CBOT_CORN",
  "CBOT_WHEAT",
  "CBOT_SOYBEANS",
  "EURONEXT_MILLING_WHEAT",
  "EURONEXT_CORN",
  "EURONEXT_RAPESEED",
];

export const CBOT_KEYS: GrainMarketInstrumentKey[] = ["CBOT_CORN", "CBOT_WHEAT", "CBOT_SOYBEANS"];
export const EURONEXT_KEYS: GrainMarketInstrumentKey[] = ["EURONEXT_MILLING_WHEAT", "EURONEXT_CORN", "EURONEXT_RAPESEED"];

export const DEFAULT_GRAIN_MARKET_TIMEFRAME = "1d" as const;
