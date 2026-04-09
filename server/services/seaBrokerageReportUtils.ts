import type { SeaBrokerageEntryRow } from "@shared/schema";

/**
 * Returns a numeric sort key for commodities based on broker hierarchy:
 * 1xxx = Grains (Wheat 1k, Corn 2k, Barley 3k)
 * 4xxx = Soy + Products (Soy 4k, Soy Oil 4100, Soy Meal 4200, Soy Cake 4300, Soy Bran 4400)
 * 5xxx = Rapeseed + Products
 * 6xxx = Sunflower + Products
 * 9xxx = Other
 */
export function getCommoditySortKey(entry: SeaBrokerageEntryRow): number {
  const label = String(entry.commodity || entry.commodityLabel || "").toLowerCase();

  // Processing products offsets
  const isOil = /\boil\b/.test(label);
  const isMeal = /\bmeal\b|\bshrot\b/.test(label);
  const isCake = /\bcake\b|\bpellet\b/.test(label);
  const isBran = /\bbran\b/.test(label);
  
  const processedOffset =
    !isOil && !isMeal && !isCake && !isBran ? 0
    : isOil ? 100
    : isMeal ? 200
    : isCake ? 300
    : 400; // Bran

  // Main Family Bases
  let familyBase = 9000;
  if (/\bwheat\b/.test(label)) familyBase = 1000;
  else if (/\bcorn\b|\bmaize\b/.test(label)) familyBase = 2000;
  else if (/\bbarley\b/.test(label)) familyBase = 3000;
  else if (/\bsoy/.test(label)) familyBase = 4000;
  else if (/\brapeseed\b|\brape\b|\bcanola\b/.test(label)) familyBase = 5000;
  else if (/\bsunflower\b/.test(label)) familyBase = 6000;

  return familyBase + processedOffset;
}

/**
 * Normalizes transport labels for concise reports.
 */
export function getTransportShort(type: string | null | undefined): string {
  const t = String(type || "").toLowerCase();
  if (["vessel", "handysize", "coaster"].includes(t)) return "Vsl";
  if (t === "rail" || t === "ua_wagons") return "UA wagons";
  if (t === "truck" || t === "dump_trucks") return "Dump trucks";
  if (t === "truck/rail" || t === "ua_wagons_dump_trucks") return "UA wagons | Dump trucks";
  const raw = String(type || "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Standardized quantity range formatter for reports.
 */
export function formatQtyRangeK(entries: SeaBrokerageEntryRow[]): string {
  const values = entries
    .flatMap((e) => [Number(e.volumeFrom), Number(e.volumeTo), Number(e.quantityMt)])
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minK = Math.round(min / 1000);
  const maxK = Math.round(max / 1000);
  return minK === maxK ? `${minK}k` : `${minK}-${maxK}k`;
}

/**
 * Standardized price range formatter.
 */
export function formatPriceRange(entries: SeaBrokerageEntryRow[]): string {
  const prices = entries
    .flatMap((e) => [Number(e.price), Number(e.priceFrom), Number(e.priceTo)])
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!prices.length) return "N/A";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return min === max ? `${f(min)}$` : `${f(min)}$-${f(max)}$`;
}

/**
 * Standardized period label formatter.
 */
export function formatPeriodSummary(entries: SeaBrokerageEntryRow[]): string {
  const labels = Array.from(
    new Set(entries.map((e) => String(e.periodLabel || "").trim()).filter(Boolean))
  );
  return labels.slice(0, 2).join(" / ");
}
