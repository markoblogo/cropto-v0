import type { CommodityCategory } from "../types";
import { normalizeCommodity as normalizeCanonicalCommodity } from "@shared/commodities";

const ALIASES: Array<{ re: RegExp; commodity: string; category: CommodityCategory; variant?: string }> = [
  { re: /\bmais\b|\bmaize\b|\bcorn\b/i, commodity: "corn", category: "grain" },
  { re: /\bwheat\s*11[.,]?5\b/i, commodity: "wheat", category: "grain", variant: "11.5" },
  { re: /\bwheat\s*12[.,]?5\b/i, commodity: "wheat", category: "grain", variant: "12.5" },
  { re: /\bwheat\b|\bfrumento\b|\btrigo\b/i, commodity: "wheat", category: "grain" },
  { re: /\bsoybean(s)?\b|\bsoy\b|\bsoia\b|\bsoja\b/i, commodity: "soybeans", category: "oilseed" },
  { re: /\bsoymeal\b|\bsoybean\s*meal\b|\bfarelo\s+de\s+soja\b/i, commodity: "soymeal", category: "oilseed" },
  { re: /\bsoybean\s*oil\b|\bsoyoil\b|\baceite\s+de\s+soja\b/i, commodity: "soybean_oil", category: "oilseed" },
  { re: /\brice\b|\barroz\b|\brise\b/i, commodity: "rice", category: "grain" },
  { re: /\bsunflower\b|\bgirasol\b/i, commodity: "sunflower", category: "oilseed" },
  { re: /\brapeseed\b|\bcolza\b|\bcanola\b/i, commodity: "rapeseed", category: "oilseed" },
  { re: /\bbarley\b|\bcebada\b/i, commodity: "barley", category: "grain" },
  { re: /\bsorghum\b|\bsorgo\b/i, commodity: "sorghum", category: "grain" },
  { re: /\boats\b|\bavena\b/i, commodity: "oats", category: "grain" },
  { re: /\brye\b|\bcenteio\b/i, commodity: "rye", category: "grain" },
  { re: /\bpalm\s*oil\b/i, commodity: "palm_oil", category: "oilseed" },
  { re: /\bsunflower\s*oil\b/i, commodity: "sunflower_oil", category: "oilseed" },
  { re: /\bsunflower\s*meal\b/i, commodity: "sunflower_meal", category: "oilseed" },
  { re: /\bsunflower\s*seed\b/i, commodity: "sunflower_seed", category: "oilseed" },
];

function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

export function normalizeCommodity(rawName: string): { commodity: string; category: CommodityCategory; variant?: string } {
  const value = String(rawName || "")
    .toLowerCase()
    .replace(/[()%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const alias of ALIASES) {
    if (alias.re.test(value)) return { commodity: alias.commodity, category: alias.category, variant: alias.variant };
  }

  const normalized = normalizeCanonicalCommodity(value);
  if (normalized.commodity && normalized.commodity !== "unknown") {
    if (/grain|cereal|wheat|corn|maize|barley|sorghum|oat|rye|rice/i.test(value)) {
      return { commodity: normalized.commodity, category: "grain" };
    }
    if (/oilseed|soy|sunflower|rapeseed|canola|colza|meal|oil/i.test(value)) {
      return { commodity: normalized.commodity, category: "oilseed" };
    }
    return { commodity: normalized.commodity, category: "other" };
  }

  if (/grain|cereal|wheat|corn|maize|barley|sorghum|oat|rye|rice/i.test(value)) {
    return { commodity: slugify(value), category: "grain" };
  }
  if (/oilseed|soy|sunflower|rapeseed|canola|colza|meal|oil/i.test(value)) {
    return { commodity: slugify(value), category: "oilseed" };
  }

  return { commodity: slugify(value), category: "other" };
}
