export interface ConversionSpec {
  specId: string;
  instrumentType: "spot_index" | "futures_proxy";
  originalUnit: string;
  targetUnit: "usd_per_ton";
  referenceUrl: string;
  conversionVersion: string;
}

const SPEC_USDA_CORN: ConversionSpec = {
  specId: "usda_jo_gr850_corn_v1",
  instrumentType: "spot_index",
  originalUnit: "usd_per_bushel",
  targetUnit: "usd_per_ton",
  referenceUrl: "https://www.ams.usda.gov/mnreports/jo_gr850.txt",
  conversionVersion: "v1",
};

const SPEC_USDA_WHEAT: ConversionSpec = {
  specId: "usda_jo_gr850_wheat_v1",
  instrumentType: "spot_index",
  originalUnit: "usd_per_bushel",
  targetUnit: "usd_per_ton",
  referenceUrl: "https://www.ams.usda.gov/mnreports/jo_gr850.txt",
  conversionVersion: "v1",
};

const SPEC_USDA_SOYBEANS: ConversionSpec = {
  specId: "usda_jo_gr850_soybeans_v1",
  instrumentType: "spot_index",
  originalUnit: "usd_per_bushel",
  targetUnit: "usd_per_ton",
  referenceUrl: "https://www.ams.usda.gov/mnreports/jo_gr850.txt",
  conversionVersion: "v1",
};

export function getUsdaSpec(commodity: "maize" | "wheat" | "soybeans"): ConversionSpec {
  if (commodity === "maize") return SPEC_USDA_CORN;
  if (commodity === "wheat") return SPEC_USDA_WHEAT;
  return SPEC_USDA_SOYBEANS;
}

