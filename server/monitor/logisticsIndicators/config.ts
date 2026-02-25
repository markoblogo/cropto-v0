function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function envNum(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) ? raw : fallback;
}

export const ENABLE_LOGISTICS_INDICATORS = envBool("ENABLE_LOGISTICS_INDICATORS", true);
export const ENABLE_BDI_WIDGET = envBool("ENABLE_BDI_WIDGET", true);
export const ENABLE_USDA_RAIL_WIDGET = envBool("ENABLE_USDA_RAIL_WIDGET", true);
export const ENABLE_LOGISTICS_PRESSURE_WIDGET = envBool("ENABLE_LOGISTICS_PRESSURE_WIDGET", true);
export const ENABLE_LOGISTICS_MOCK_FALLBACK = envBool("ENABLE_LOGISTICS_MOCK_FALLBACK", true);

export const LOGISTICS_INDICATORS_REFRESH_MS = envNum("LOGISTICS_INDICATORS_REFRESH_MS", 15 * 60 * 1000);
export const LOGISTICS_INDICATORS_CACHE_TTL_MS = envNum("LOGISTICS_INDICATORS_CACHE_TTL_MS", 20 * 60 * 1000);
export const BDI_FETCH_TIMEOUT_MS = envNum("BDI_FETCH_TIMEOUT_MS", 7000);
export const USDA_GTR_FETCH_TIMEOUT_MS = envNum("USDA_GTR_FETCH_TIMEOUT_MS", 9000);

export const BDI_SOURCE_URL =
  process.env.BDI_SOURCE_URL || "https://fred.stlouisfed.org/graph/fredgraph.csv?id=BDIY";
export const USDA_GTR_RAIL_TARIFF_URL =
  process.env.USDA_GTR_RAIL_TARIFF_URL || "https://www.ams.usda.gov/sites/default/files/media/GTRTable7.csv";
