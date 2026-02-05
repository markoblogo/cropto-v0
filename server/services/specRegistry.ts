export interface ConversionSpec {
  specId: string;
  instrumentType: "spot_index" | "futures_proxy";
  originalUnit: string;
  targetUnit: "usd_per_ton";
  referenceUrl: string;
  conversionVersion: string;
}

export interface SpreadSpec {
  spreadSpecId: string;
  country: "BR" | "AR";
  commodity: string;
  basis: string;
  anchorCountry: "US";
  anchorCommodity: string;
  fallbackOrder: Array<"USDA_AMS" | "IGC" | "manual" | "spike_telegram" | "mock">;
  maxAgeDays: number;
  syntheticAllowed: boolean;
  // Temporary placeholder until proper calibrated alpha/beta model is plugged in.
  syntheticModel: "last_known_with_anchor_drift";
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

export const SPREAD_SPECS: SpreadSpec[] = [
  {
    spreadSpecId: "br_soybeans_paranagua_v1",
    country: "BR",
    commodity: "soybeans",
    basis: "Brazil (Paranagua)",
    anchorCountry: "US",
    anchorCommodity: "soybeans",
    fallbackOrder: ["IGC", "manual", "spike_telegram", "mock"],
    maxAgeDays: 2,
    syntheticAllowed: true,
    syntheticModel: "last_known_with_anchor_drift",
  },
  {
    spreadSpecId: "br_maize_paranagua_v1",
    country: "BR",
    commodity: "maize",
    basis: "Brazil Feed (Paranagua)",
    anchorCountry: "US",
    anchorCommodity: "maize",
    fallbackOrder: ["IGC", "manual", "spike_telegram", "mock"],
    maxAgeDays: 2,
    syntheticAllowed: true,
    syntheticModel: "last_known_with_anchor_drift",
  },
  {
    spreadSpecId: "ar_soybeans_upriver_v1",
    country: "AR",
    commodity: "soybeans",
    basis: "Argentina (Up River)",
    anchorCountry: "US",
    anchorCommodity: "soybeans",
    fallbackOrder: ["IGC", "manual", "spike_telegram", "mock"],
    maxAgeDays: 2,
    syntheticAllowed: true,
    syntheticModel: "last_known_with_anchor_drift",
  },
  {
    spreadSpecId: "ar_maize_upriver_v1",
    country: "AR",
    commodity: "maize",
    basis: "Argentina Feed (Up River)",
    anchorCountry: "US",
    anchorCommodity: "maize",
    fallbackOrder: ["IGC", "manual", "spike_telegram", "mock"],
    maxAgeDays: 2,
    syntheticAllowed: true,
    syntheticModel: "last_known_with_anchor_drift",
  },
];

export function findSpreadSpec(country: "BR" | "AR", commodity: string, basis: string): SpreadSpec | null {
  const commodityLower = commodity.toLowerCase();
  return (
    SPREAD_SPECS.find(
      (s) =>
        s.country === country &&
        s.commodity === commodityLower &&
        basis.toLowerCase().startsWith(s.basis.toLowerCase())
    ) || null
  );
}
