export type CommoditySlug =
  | "corn"
  | "wheat-115"
  | "feed-wheat"
  | "soy-gmo"
  | "sunflower-processing"
  | "rapeseed"
  | "other";

export interface CommodityInfo {
  slug: CommoditySlug;
  name: string;
  indexName: string;
  basis: string;
  indexId?: string; // optional: resolved at runtime from DB indexes table
}

export const BASIS_CPT_ODESA = "CPT Odesa";

export const AVAILABLE_COMMODITIES: CommodityInfo[] = [
  {
    slug: "corn",
    name: "Corn",
    indexName: "Corn Export Index",
    basis: BASIS_CPT_ODESA,
  },
  {
    slug: "wheat-115",
    name: "Milling Wheat 11.5%",
    indexName: "Wheat 11.5 Export Index",
    basis: BASIS_CPT_ODESA,
  },
  {
    slug: "feed-wheat",
    name: "Feed Wheat",
    indexName: "Feed Wheat Export Index",
    basis: BASIS_CPT_ODESA,
  },
  {
    slug: "soy-gmo",
    name: "GMO Soybeans",
    indexName: "Soybeans GMO Export Index",
    basis: BASIS_CPT_ODESA,
  },
  {
    slug: "sunflower-processing",
    name: "Sunflower (processing)",
    indexName: "Sunflower Processing Index",
    basis: BASIS_CPT_ODESA,
  },
  {
    slug: "rapeseed",
    name: "Rapeseed",
    indexName: "Rapeseed Processing Index",
    basis: BASIS_CPT_ODESA,
  },
];

export const COMMODITY_MAP: Record<CommoditySlug, CommodityInfo> = AVAILABLE_COMMODITIES.reduce(
  (acc, c) => {
    acc[c.slug] = c;
    return acc;
  },
  {} as Record<CommoditySlug, CommodityInfo>
);
