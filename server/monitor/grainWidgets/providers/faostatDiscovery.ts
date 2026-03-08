import {
  FAOSTAT_BASE_URL,
  FAOSTAT_DATASOURCE,
  FAOSTAT_DISCOVERY_TTL_MS,
  FAOSTAT_TIMEOUT_MS,
} from "../config";
import { fetchTextWithTimeout } from "./utils";

type DefEntry = {
  code: string;
  label: string;
  iso3?: string;
  unit?: string;
};

type DiscoveryCache = {
  fetchedAt: number;
  areas: DefEntry[];
  items: DefEntry[];
  elements: DefEntry[];
};

let discoveryCache: DiscoveryCache | null = null;

function baseUrl(): string {
  return FAOSTAT_BASE_URL.replace(/\/+$/, "");
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDefEntries(payload: any): DefEntry[] {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.result)
        ? payload.result
        : [];

  return list
    .map((entry: any) => {
      const code = String(
        entry?.code ?? entry?.Code ?? entry?.id ?? entry?.ID ?? entry?.item_code ?? entry?.area_code ?? entry?.element_code ?? "",
      ).trim();
      const label = String(
        entry?.label ?? entry?.Label ?? entry?.name ?? entry?.Name ?? entry?.item ?? entry?.area ?? entry?.element ?? "",
      ).trim();
      const iso3 = String(entry?.iso3 ?? entry?.ISO3 ?? entry?.iso_code3 ?? "").trim() || undefined;
      const unit = String(entry?.unit ?? entry?.Unit ?? entry?.units ?? "").trim() || undefined;
      if (!code || !label) return undefined;
      return { code, label, iso3, unit };
    })
    .filter((entry: DefEntry | undefined): entry is DefEntry => Boolean(entry));
}

async function fetchDefs(path: string): Promise<{ entries: DefEntry[]; sourceUrlUsed: string }> {
  const url = `${baseUrl()}${path}`;
  const raw = await fetchTextWithTimeout(url, FAOSTAT_TIMEOUT_MS, {
    accept: "application/json,text/plain,*/*",
  });
  const parsed = JSON.parse(raw);
  return {
    entries: parseDefEntries(parsed),
    sourceUrlUsed: url,
  };
}

async function fetchDefsVariants(path: string): Promise<{ entries: DefEntry[]; sourceUrlUsed: string }> {
  const variants = [
    `${path}`,
    `${path}?datasource=${encodeURIComponent(FAOSTAT_DATASOURCE)}`,
  ];
  let lastError: unknown;
  for (const variant of variants) {
    try {
      const result = await fetchDefs(variant);
      if (result.entries.length > 0) return result;
      lastError = new Error(`empty_defs:${variant}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`faostat_defs_failed:${path}`);
}

export async function fetchFaostatDiscovery(): Promise<{
  areas: DefEntry[];
  items: DefEntry[];
  elements: DefEntry[];
  sourceUrls: string[];
  cacheHit: boolean;
}> {
  const now = Date.now();
  if (discoveryCache && now - discoveryCache.fetchedAt <= FAOSTAT_DISCOVERY_TTL_MS) {
    return {
      areas: discoveryCache.areas,
      items: discoveryCache.items,
      elements: discoveryCache.elements,
      sourceUrls: [],
      cacheHit: true,
    };
  }

  const [areas, items, elements] = await Promise.all([
    fetchDefsVariants(`/definitions/types/area`),
    fetchDefsVariants(`/definitions/types/item`),
    fetchDefsVariants(`/definitions/types/element`),
  ]);

  discoveryCache = {
    fetchedAt: now,
    areas: areas.entries,
    items: items.entries,
    elements: elements.entries,
  };

  return {
    areas: areas.entries,
    items: items.entries,
    elements: elements.entries,
    sourceUrls: [areas.sourceUrlUsed, items.sourceUrlUsed, elements.sourceUrlUsed],
    cacheHit: false,
  };
}

function findFirstCode(entries: DefEntry[], matchers: RegExp[]): string | undefined {
  for (const entry of entries) {
    const text = normalizeText(entry.label);
    if (matchers.some((matcher) => matcher.test(text))) return entry.code;
  }
  return undefined;
}

export function findAreaCodes(args: {
  areas: DefEntry[];
  territory: "UA" | "US" | "BR" | "AR" | "EU";
}): { selectedCodes: string[]; labels: string[] } {
  const areas = args.areas;
  const byIso = new Map<string, DefEntry>();
  for (const area of areas) {
    if (area.iso3) byIso.set(area.iso3.toUpperCase(), area);
  }

  const getByIsoOrName = (iso3: string, matchers: RegExp[]): DefEntry | undefined => {
    const byCode = byIso.get(iso3);
    if (byCode) return byCode;
    return areas.find((entry) => matchers.some((matcher) => matcher.test(normalizeText(entry.label))));
  };

  if (args.territory === "EU") {
    const euCountries: Array<{ iso3: string; names: RegExp[] }> = [
      { iso3: "FRA", names: [/\bfrance\b/] },
      { iso3: "DEU", names: [/\bgermany\b/] },
      { iso3: "POL", names: [/\bpoland\b/] },
      { iso3: "ROU", names: [/\bromania\b/] },
      { iso3: "ESP", names: [/\bspain\b/] },
    ];
    const selected = euCountries
      .map((country) => getByIsoOrName(country.iso3, country.names))
      .filter((entry): entry is DefEntry => Boolean(entry));
    return {
      selectedCodes: selected.map((entry) => entry.code),
      labels: selected.map((entry) => entry.label),
    };
  }

  const singleMap: Record<"UA" | "US" | "BR" | "AR", { iso3: string; names: RegExp[] }> = {
    UA: { iso3: "UKR", names: [/\bukraine\b/] },
    US: { iso3: "USA", names: [/\bunited states\b/, /\busa\b/] },
    BR: { iso3: "BRA", names: [/\bbrazil\b/] },
    AR: { iso3: "ARG", names: [/\bargentina\b/] },
  };
  const target = singleMap[args.territory as "UA" | "US" | "BR" | "AR"];
  const area = getByIsoOrName(target.iso3, target.names);
  return {
    selectedCodes: area ? [area.code] : [],
    labels: area ? [area.label] : [],
  };
}

export function findItemCodes(items: DefEntry[]): Record<"WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER", string | undefined> {
  return {
    WHEAT: findFirstCode(items, [/\bwheat\b/]),
    MAIZE: findFirstCode(items, [/\bmaize\b/, /\bcorn\b/]),
    SOY: findFirstCode(items, [/\bsoybeans?\b/, /\bsoya\b/]),
    RAPESEED: findFirstCode(items, [/\brapeseed\b/, /\bcanola\b/]),
    SUNFLOWER: findFirstCode(items, [/\bsunflower\s*seed\b/, /\bsunflower\b/]),
  };
}

export function findElementCodeProducerPrice(elements: DefEntry[]): {
  code?: string;
  label?: string;
  unit?: string;
} {
  const normalized = elements.map((entry) => ({
    ...entry,
    text: normalizeText(`${entry.label} ${entry.unit || ""}`),
  }));

  const usdTonne = normalized.find((entry) =>
    entry.text.includes("producer price") &&
    (entry.text.includes("usd tonne") || entry.text.includes("usd ton") || entry.text.includes("usd/tonne") || entry.text.includes("usd per tonne")),
  );
  if (usdTonne) return { code: usdTonne.code, label: usdTonne.label, unit: usdTonne.unit || "USD/tonne" };

  const lcuTonne = normalized.find((entry) =>
    entry.text.includes("producer price") && (entry.text.includes("lcu") || entry.text.includes("local currency")),
  );
  if (lcuTonne) return { code: lcuTonne.code, label: lcuTonne.label, unit: lcuTonne.unit || "LCU/tonne" };

  const generic = normalized.find((entry) => entry.text.includes("producer price"));
  if (generic) return { code: generic.code, label: generic.label, unit: generic.unit };

  return {};
}
