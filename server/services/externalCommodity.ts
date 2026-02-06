const BUSHEL_KG: Record<string, number> = {
  maize: 25.40117272,
  wheat: 27.2155422,
  soybeans: 27.2155422,
  barley: 21.77243044,
  oats: 14.515,
  rye: 25.40117272,
  sorghum: 25.40117272,
  rice: 20.41165625,
  rapeseed: 22.6796185,
  sunflower: 22.6796185,
};

const COMMODITY_ALIASES: Array<{ re: RegExp; to: string }> = [
  { re: /\bcorn\b|\bmaize\b/i, to: "maize" },
  { re: /\bwheat\b/i, to: "wheat" },
  { re: /\bsoybean(s)?\b|\bsoy\b/i, to: "soybeans" },
  { re: /\bsoy\s*meal\b|\bsoymeal\b/i, to: "soymeal" },
  { re: /\bsoy\s*oil\b|\bsoyoil\b/i, to: "soyoil" },
  { re: /\bbarley\b/i, to: "barley" },
  { re: /\brice\b/i, to: "rice" },
  { re: /\brapeseed\b|\bcanola\b/i, to: "rapeseed" },
  { re: /\bcanola\s*oil\b/i, to: "canola_oil" },
  { re: /\bsunflower\b/i, to: "sunflower" },
  { re: /\bsunflower\s*seed\b/i, to: "sunflower_seed" },
  { re: /\bsunflower\s*oil\b/i, to: "sunflower_oil" },
  { re: /\boats?\b/i, to: "oats" },
  { re: /\brye\b/i, to: "rye" },
  { re: /\bsorghum\b|\bmilo\b/i, to: "sorghum" },
  { re: /\bmillet\b/i, to: "millet" },
  { re: /\bpeas?\b/i, to: "peas" },
  { re: /\blentils?\b/i, to: "lentils" },
];

function slugifyExternalCommodity(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return slug || "unknown";
}

export function normalizeExternalCommodityName(raw: string): string {
  const value = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return "unknown";
  for (const alias of COMMODITY_ALIASES) {
    if (alias.re.test(value)) return alias.to;
  }
  // For demo: accept new commodities and normalize to a stable slug instead of dropping.
  return slugifyExternalCommodity(value);
}

export function usdPerBushelToTon(
  price: number,
  commodity: string
): { value: number; kgPerBushel: number; approximate: boolean } | null {
  const normalized = normalizeExternalCommodityName(commodity);
  const knownKg = BUSHEL_KG[normalized];
  // Only convert when the bushel weight is known for the commodity.
  if (!knownKg || !(knownKg > 0)) return null;
  return {
    value: Number((price * (1000 / knownKg)).toFixed(2)),
    kgPerBushel: knownKg,
    approximate: false,
  };
}
