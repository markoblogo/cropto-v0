export type CanonicalCommodity =
  | "corn"
  | "wheat"
  | "soybeans"
  | "soymeal"
  | "sunflower"
  | "rapeseed"
  | "barley"
  | "rice"
  | "oats"
  | "rye"
  | "sorghum"
  | "soybean_oil"
  | "sunflower_oil"
  | "sunflower_meal"
  | "sunflower_seed"
  | "palm_oil"
  | string;

export const BASIS_CPT_ODESA = "CPT Odesa (export)";

type AliasRule = {
  canonical: CanonicalCommodity;
  aliases: string[];
  displayName: string;
};

const ALIAS_RULES: AliasRule[] = [
  { canonical: "corn", aliases: ["corn", "maize", "mais"], displayName: "Corn" },
  { canonical: "wheat", aliases: ["wheat", "trigo", "frumento"], displayName: "Wheat" },
  { canonical: "soybeans", aliases: ["soy", "soybean", "soybeans", "soia", "soya", "soja"], displayName: "Soybeans" },
  { canonical: "soymeal", aliases: ["soymeal", "soybean meal", "soya meal", "farelo de soja"], displayName: "Soymeal" },
  { canonical: "sunflower", aliases: ["sunflower", "girasol"], displayName: "Sunflower" },
  { canonical: "rapeseed", aliases: ["rapeseed", "canola", "colza"], displayName: "Rapeseed" },
  { canonical: "barley", aliases: ["barley", "cebada"], displayName: "Barley" },
  { canonical: "rice", aliases: ["rice", "arroz", "rise"], displayName: "Rice" },
  { canonical: "oats", aliases: ["oats", "avena"], displayName: "Oats" },
  { canonical: "rye", aliases: ["rye", "centeio"], displayName: "Rye" },
  { canonical: "sorghum", aliases: ["sorghum", "sorgo"], displayName: "Sorghum" },
  { canonical: "soybean_oil", aliases: ["soybean oil", "soyoil", "soy oil", "aceite de soja"], displayName: "Soybean Oil" },
  { canonical: "sunflower_oil", aliases: ["sunflower oil"], displayName: "Sunflower Oil" },
  { canonical: "sunflower_meal", aliases: ["sunflower meal"], displayName: "Sunflower Meal" },
  { canonical: "sunflower_seed", aliases: ["sunflower seed"], displayName: "Sunflower Seed" },
  { canonical: "palm_oil", aliases: ["palm oil"], displayName: "Palm Oil" },
];

function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function normalizeRaw(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[()%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCommodity(raw: string): {
  commodity: CanonicalCommodity;
  displayName: string;
  aliasesMatched: string[];
} {
  const value = normalizeRaw(raw);
  if (!value) {
    return { commodity: "unknown", displayName: "Unknown", aliasesMatched: [] };
  }

  for (const rule of ALIAS_RULES) {
    const matched = rule.aliases.filter((alias) => value.includes(alias));
    if (matched.length > 0) {
      return {
        commodity: rule.canonical,
        displayName: rule.displayName,
        aliasesMatched: matched,
      };
    }
  }

  return {
    commodity: slugify(value),
    displayName: value
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" "),
    aliasesMatched: [],
  };
}

const DISPLAY_BY_CANONICAL = new Map(ALIAS_RULES.map((rule) => [rule.canonical, rule.displayName]));

export function commodityDisplayName(rawOrCanonical: string): string {
  const normalized = normalizeCommodity(rawOrCanonical);
  return DISPLAY_BY_CANONICAL.get(normalized.commodity) || normalized.displayName;
}

export const commodityAliases: Record<string, string[]> = Object.fromEntries(
  ALIAS_RULES.map((rule) => [rule.canonical, [...rule.aliases]]),
);

export type CommoditySlug =
  | "corn"
  | "wheat-115"
  | "feed-wheat"
  | "soy-gmo"
  | "soymeal"
  | "sunflower"
  | "rapeseed"
  | "barley"
  | "rice";

export type CommodityMeta = {
  slug: CommoditySlug;
  name: string;
  canonical: CanonicalCommodity;
  indexName: string;
};

export const AVAILABLE_COMMODITIES: CommodityMeta[] = [
  { slug: "corn", name: "Corn", canonical: "corn", indexName: "Corn" },
  { slug: "wheat-115", name: "Wheat 11.5%", canonical: "wheat", indexName: "Wheat 11.5%" },
  { slug: "feed-wheat", name: "Feed Wheat", canonical: "wheat", indexName: "Feed Wheat" },
  { slug: "soy-gmo", name: "Soybeans", canonical: "soybeans", indexName: "Soybeans (GMO)" },
  { slug: "soymeal", name: "Soymeal", canonical: "soymeal", indexName: "Soymeal" },
  { slug: "sunflower", name: "Sunflower", canonical: "sunflower", indexName: "Sunflower" },
  { slug: "rapeseed", name: "Rapeseed", canonical: "rapeseed", indexName: "Rapeseed" },
  { slug: "barley", name: "Barley", canonical: "barley", indexName: "Barley" },
  { slug: "rice", name: "Rice", canonical: "rice", indexName: "Rice" },
];

export const COMMODITY_MAP: Record<CommoditySlug, CommodityMeta> = Object.fromEntries(
  AVAILABLE_COMMODITIES.map((item) => [item.slug, item]),
) as Record<CommoditySlug, CommodityMeta>;
