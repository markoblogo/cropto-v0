const BUSHEL_KG: Record<string, number> = {
  maize: 25.40117272,
  wheat: 27.2155422,
  soybeans: 27.2155422,
  barley: 21.77243044,
};

const COMMODITY_ALIASES: Array<{ re: RegExp; to: string }> = [
  { re: /\bcorn\b|\bmaize\b/i, to: "maize" },
  { re: /\bwheat\b/i, to: "wheat" },
  { re: /\bsoybean(s)?\b|\bsoy\b/i, to: "soybeans" },
  { re: /\bbarley\b/i, to: "barley" },
  { re: /\brice\b/i, to: "rice" },
  { re: /\brapeseed\b|\bcanola\b/i, to: "rapeseed" },
  { re: /\bsunflower\b/i, to: "sunflower" },
  { re: /\boats?\b/i, to: "oats" },
  { re: /\brye\b/i, to: "rye" },
];

export function normalizeExternalCommodityName(raw: string): string {
  const value = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return "unknown";
  for (const alias of COMMODITY_ALIASES) {
    if (alias.re.test(value)) return alias.to;
  }
  return value;
}

export function usdPerBushelToTon(price: number, commodity: string): number | null {
  const normalized = normalizeExternalCommodityName(commodity);
  const kg = BUSHEL_KG[normalized];
  if (!kg || !(kg > 0)) return null;
  return Number((price * (1000 / kg)).toFixed(2));
}

