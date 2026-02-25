import {
  ENABLE_FPMA_DISCOVERY,
  FPMA_API_BASE_URL,
  FPMA_CROP_MAP,
  FPMA_DISCOVERY_CACHE_TTL_MS,
  FPMA_DISCOVERY_TTL_MS,
  FPMA_PRICE_TYPES,
  FPMA_TIMEOUT_MS,
} from "../config";

type CropKey = "WHEAT" | "MAIZE" | "SOY" | "RAPESEED" | "SUNFLOWER";
type PriceType = "WHOLESALE" | "RETAIL";

type EndpointProbe = {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  elapsedMs?: number;
  error?: string;
};

type CountryEntry = {
  id: string | number;
  code?: string;
  iso3?: string;
  name: string;
  norm: string;
};

type CommodityEntry = {
  id: string | number;
  name: string;
  norm: string;
  synonyms?: string[];
};

type PriceTypeEntry = {
  id: string | number;
  name: string;
  norm: string;
};

export type FpmaDiscoverySnapshot = {
  fetchedAt: string;
  baseUrl: string;
  endpointsTried: EndpointProbe[];
  countries: CountryEntry[];
  commodities: CommodityEntry[];
  priceTypes?: PriceTypeEntry[];
  notes?: string[];
};

export type ResolvedFpmaQuery = {
  ok: boolean;
  country: { code: string; id?: string | number; name?: string };
  commodity: { key: string; ids?: Array<string | number>; name?: string };
  priceType?: { name: PriceType; id?: string | number };
  methodUsed: "id" | "token" | "fallback";
  warnings?: string[];
};

type CropMapEntry = {
  label: string;
  synonyms: string[];
  fpmaCommodityIds: string[];
};

type FpmaDiscoveryDebug = {
  cacheHit: boolean;
  stale: boolean;
  fetchedAt?: string;
  countriesCount: number;
  commoditiesCount: number;
  priceTypesCount: number;
  endpointsTried: EndpointProbe[];
  notes?: string[];
};

const iso3to2: Record<string, string> = {
  UKR: "UA",
  USA: "US",
  BRA: "BR",
  ARG: "AR",
  FRA: "FR",
  DEU: "DE",
  POL: "PL",
  ROU: "RO",
  ESP: "ES",
};

const countryNameAliases: Record<string, string[]> = {
  UA: ["ukraine"],
  US: ["united states", "usa", "u.s."],
  BR: ["brazil"],
  AR: ["argentina"],
  FR: ["france"],
  DE: ["germany"],
  PL: ["poland"],
  RO: ["romania"],
  ES: ["spain"],
};

const explicitDiscoveryPaths: Array<{ name: string; path: string }> = [
  { name: "countries", path: "countries" },
  { name: "commodities", path: "commodities" },
  { name: "priceTypes", path: "priceTypes" },
  { name: "metadata", path: "metadata" },
  { name: "lookup", path: "lookup" },
  { name: "list", path: "list" },
];

const derivedDiscoveryPaths: Array<{ name: string; path: string }> = [
  { name: "prices", path: "prices?format=json" },
  { name: "data", path: "data?format=json" },
  { name: "series", path: "series?format=json" },
  { name: "markets", path: "markets?format=json" },
];

let snapshotCache:
  | {
      fetchedAtMs: number;
      snapshot: FpmaDiscoverySnapshot;
      cacheHit: boolean;
      stale: boolean;
    }
  | null = null;

const resolvedCache = new Map<
  string,
  {
    resolved: ResolvedFpmaQuery;
    fetchedAtMs: number;
  }
>();

function normalize(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cropMapDefault(): Record<CropKey, CropMapEntry> {
  return {
    WHEAT: { label: "Wheat", synonyms: ["wheat", "triticum", "soft wheat", "durum"], fpmaCommodityIds: [] },
    MAIZE: { label: "Maize (Corn)", synonyms: ["maize", "corn", "yellow maize", "white maize"], fpmaCommodityIds: [] },
    SOY: { label: "Soybeans", synonyms: ["soy", "soybean", "soybeans", "soya"], fpmaCommodityIds: [] },
    RAPESEED: { label: "Rapeseed (Canola)", synonyms: ["rapeseed", "canola", "colza"], fpmaCommodityIds: [] },
    SUNFLOWER: { label: "Sunflower seed", synonyms: ["sunflower", "sunflower seed", "sunflower seeds"], fpmaCommodityIds: [] },
  };
}

function parseCropMap(): Record<CropKey, CropMapEntry> {
  const fallback = cropMapDefault();
  try {
    const parsed = JSON.parse(FPMA_CROP_MAP || "{}");
    const out = { ...fallback };
    for (const crop of Object.keys(fallback) as CropKey[]) {
      const entry = parsed?.[crop];
      if (Array.isArray(entry)) {
        out[crop] = {
          ...out[crop],
          synonyms: entry.map((v: unknown) => normalize(v)).filter(Boolean),
        };
      } else if (entry && typeof entry === "object") {
        out[crop] = {
          label: String((entry as any).label || out[crop].label),
          synonyms: Array.isArray((entry as any).synonyms)
            ? (entry as any).synonyms.map((v: unknown) => normalize(v)).filter(Boolean)
            : out[crop].synonyms,
          fpmaCommodityIds: Array.isArray((entry as any).fpmaCommodityIds)
            ? (entry as any).fpmaCommodityIds.map((v: unknown) => String(v)).filter(Boolean)
            : out[crop].fpmaCommodityIds,
        };
      }
    }
    return out;
  } catch {
    return fallback;
  }
}

function toArrayPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const keys = ["data", "results", "items", "records", "response", "series", "value"];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === "object") {
      const nested = toArrayPayload(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function pickFirst(obj: any, keys: string[]): unknown {
  for (const key of keys) {
    if (obj && obj[key] != null && String(obj[key]).trim() !== "") return obj[key];
  }
  return undefined;
}

function parseCountries(rows: any[]): CountryEntry[] {
  const out: CountryEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = pickFirst(row, ["id", "country_id", "adm0_id", "code", "countryCode", "iso3", "iso"]);
    const name = pickFirst(row, ["name", "country", "country_name", "adm0_name", "label", "area"]);
    if (id == null || name == null) continue;
    const codeRaw = String(pickFirst(row, ["code", "iso", "iso2", "countryCode", "adm0_code"]) || "").toUpperCase();
    const iso3Raw = String(pickFirst(row, ["iso3", "iso3_code"]) || "").toUpperCase();
    const code = codeRaw.length === 2 ? codeRaw : iso3to2[iso3Raw] || undefined;
    const key = `${id}:${String(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: typeof id === "number" ? id : String(id), code, iso3: iso3Raw || undefined, name: String(name), norm: normalize(name) });
  }
  return out;
}

function parseCommodities(rows: any[]): CommodityEntry[] {
  const out: CommodityEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = pickFirst(row, ["id", "commodity_id", "item_id", "product_id", "cm_id", "code"]);
    const name = pickFirst(row, ["name", "commodity", "commodity_name", "item", "item_name", "product", "product_name", "label", "cm_name"]);
    if (id == null || name == null) continue;
    const key = `${id}:${String(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: typeof id === "number" ? id : String(id), name: String(name), norm: normalize(name) });
  }
  return out;
}

function parsePriceTypes(rows: any[]): PriceTypeEntry[] {
  const out: PriceTypeEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = pickFirst(row, ["id", "price_type_id", "type_id", "market_type_id", "code"]);
    const name = pickFirst(row, ["name", "price_type", "priceType", "type", "market_type", "pt_name", "label"]);
    if (id == null || name == null) continue;
    const norm = normalize(name);
    if (!norm.includes("retail") && !norm.includes("wholesale")) continue;
    const key = `${id}:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: typeof id === "number" ? id : String(id), name: String(name), norm });
  }
  return out;
}

function deriveFromRecords(rows: any[]): {
  countries: CountryEntry[];
  commodities: CommodityEntry[];
  priceTypes: PriceTypeEntry[];
} {
  const countries: CountryEntry[] = [];
  const commodities: CommodityEntry[] = [];
  const priceTypes: PriceTypeEntry[] = [];
  const countrySeen = new Set<string>();
  const commoditySeen = new Set<string>();
  const typeSeen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const cName = pickFirst(row, ["country", "country_name", "adm0_name", "area"]);
    const cCodeRaw = String(pickFirst(row, ["countryCode", "country_code", "adm0_code", "iso", "iso2", "iso3"]) || "").toUpperCase();
    const cCode = cCodeRaw.length === 2 ? cCodeRaw : iso3to2[cCodeRaw] || undefined;
    if (cName != null) {
      const id = pickFirst(row, ["country_id", "adm0_id", "countryCode", "country_code", "iso3", "iso2", "country"]);
      const key = `${String(id || cName)}:${String(cName)}`;
      if (!countrySeen.has(key)) {
        countrySeen.add(key);
        countries.push({
          id: typeof id === "number" ? id : String(id || cName),
          code: cCode,
          iso3: cCodeRaw.length === 3 ? cCodeRaw : undefined,
          name: String(cName),
          norm: normalize(cName),
        });
      }
    }

    const commodityName = pickFirst(row, ["commodity", "commodity_name", "item", "item_name", "product", "product_name", "cm_name"]);
    if (commodityName != null) {
      const id = pickFirst(row, ["commodity_id", "item_id", "item_code", "cm_id", "product_id", "commodity"]);
      const key = `${String(id || commodityName)}:${String(commodityName)}`;
      if (!commoditySeen.has(key)) {
        commoditySeen.add(key);
        commodities.push({ id: typeof id === "number" ? id : String(id || commodityName), name: String(commodityName), norm: normalize(commodityName) });
      }
    }

    const ptName = pickFirst(row, ["price_type", "priceType", "market_type", "type", "pt_name"]);
    if (ptName != null) {
      const norm = normalize(ptName);
      if (norm.includes("retail") || norm.includes("wholesale")) {
        const id = pickFirst(row, ["price_type_id", "type_id", "market_type_id", "price_type", "priceType"]);
        const key = `${String(id || ptName)}:${norm}`;
        if (!typeSeen.has(key)) {
          typeSeen.add(key);
          priceTypes.push({ id: typeof id === "number" ? id : String(id || ptName), name: String(ptName), norm });
        }
      }
    }
  }

  return { countries, commodities, priceTypes };
}

async function fetchJsonProbe(url: string): Promise<{ ok: boolean; status?: number; elapsedMs: number; data?: any; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FPMA_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "CroptoMonitor/fpma-discovery",
      },
    });
    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!response.ok) {
      return { ok: false, status: response.status, elapsedMs: Date.now() - started, error: `HTTP ${response.status}` };
    }
    if (data == null) {
      return { ok: false, status: response.status, elapsedMs: Date.now() - started, error: "PARSE_EMPTY" };
    }
    return { ok: true, status: response.status, elapsedMs: Date.now() - started, data };
  } catch (error: any) {
    return { ok: false, elapsedMs: Date.now() - started, error: String(error?.message || "fetch_failed") };
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(path: string): string {
  return `${FPMA_API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function fetchFpmaDiscoverySnapshot(_ctx?: { force?: boolean }): Promise<FpmaDiscoverySnapshot> {
  if (!ENABLE_FPMA_DISCOVERY) {
    return {
      fetchedAt: new Date().toISOString(),
      baseUrl: FPMA_API_BASE_URL,
      endpointsTried: [],
      countries: [],
      commodities: [],
      priceTypes: [],
      notes: ["fpma_discovery_disabled"],
    };
  }

  const now = Date.now();
  if (snapshotCache && now - snapshotCache.fetchedAtMs <= FPMA_DISCOVERY_TTL_MS) {
    snapshotCache.cacheHit = true;
    snapshotCache.stale = false;
    return snapshotCache.snapshot;
  }

  const endpointsTried: EndpointProbe[] = [];
  const notes: string[] = [];
  const countries: CountryEntry[] = [];
  const commodities: CommodityEntry[] = [];
  const priceTypes: PriceTypeEntry[] = [];

  let explicitFound = false;
  for (const endpoint of explicitDiscoveryPaths) {
    const url = buildUrl(endpoint.path);
    const probe = await fetchJsonProbe(url);
    endpointsTried.push({ name: endpoint.name, url, ok: probe.ok, status: probe.status, elapsedMs: probe.elapsedMs, error: probe.error });
    if (!probe.ok || probe.data == null) continue;
    const rows = toArrayPayload(probe.data);
    if (!rows.length) continue;

    if (endpoint.name === "countries" || endpoint.name === "metadata" || endpoint.name === "lookup" || endpoint.name === "list") {
      const parsed = parseCountries(rows);
      if (parsed.length) {
        countries.push(...parsed);
        explicitFound = true;
      }
    }
    if (endpoint.name === "commodities" || endpoint.name === "metadata" || endpoint.name === "lookup" || endpoint.name === "list") {
      const parsed = parseCommodities(rows);
      if (parsed.length) {
        commodities.push(...parsed);
        explicitFound = true;
      }
    }
    if (endpoint.name === "priceTypes" || endpoint.name === "metadata" || endpoint.name === "lookup" || endpoint.name === "list") {
      const parsed = parsePriceTypes(rows);
      if (parsed.length) {
        priceTypes.push(...parsed);
        explicitFound = true;
      }
    }
  }

  if (!explicitFound || !countries.length || !commodities.length) {
    notes.push("derived_discovery_used");
    for (const endpoint of derivedDiscoveryPaths) {
      const url = buildUrl(endpoint.path);
      const probe = await fetchJsonProbe(url);
      endpointsTried.push({ name: `derived:${endpoint.name}`, url, ok: probe.ok, status: probe.status, elapsedMs: probe.elapsedMs, error: probe.error });
      if (!probe.ok || probe.data == null) continue;
      const rows = toArrayPayload(probe.data);
      if (!rows.length) continue;
      const derived = deriveFromRecords(rows);
      countries.push(...derived.countries);
      commodities.push(...derived.commodities);
      priceTypes.push(...derived.priceTypes);
      if (countries.length && commodities.length) break;
    }
  }

  const dedupeBy = <T>(list: T[], keyOf: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of list) {
      const key = keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const snapshot: FpmaDiscoverySnapshot = {
    fetchedAt: new Date().toISOString(),
    baseUrl: FPMA_API_BASE_URL,
    endpointsTried,
    countries: dedupeBy(countries, (item) => `${item.id}:${item.norm}`),
    commodities: dedupeBy(commodities, (item) => `${item.id}:${item.norm}`),
    priceTypes: dedupeBy(priceTypes, (item) => `${item.id}:${item.norm}`),
    notes: notes.length ? notes : undefined,
  };

  if (!snapshot.countries.length) notes.push("countries_unresolved");
  if (!snapshot.commodities.length) notes.push("commodities_unresolved");
  if (!snapshot.priceTypes?.length) notes.push("price_types_unresolved");

  snapshotCache = {
    fetchedAtMs: now,
    snapshot: {
      ...snapshot,
      notes: notes.length ? Array.from(new Set([...(snapshot.notes || []), ...notes])) : snapshot.notes,
    },
    cacheHit: false,
    stale: false,
  };

  return snapshotCache.snapshot;
}

function resolveCountry(snapshot: FpmaDiscoverySnapshot, countryCode: string): CountryEntry | undefined {
  const target = String(countryCode || "").toUpperCase();
  if (!target) return undefined;
  const byCode = snapshot.countries.find((country) => String(country.code || "").toUpperCase() === target);
  if (byCode) return byCode;

  const byIso3 = snapshot.countries.find((country) => iso3to2[String(country.iso3 || "").toUpperCase()] === target);
  if (byIso3) return byIso3;

  const aliases = countryNameAliases[target] || [];
  return snapshot.countries.find((country) => aliases.some((alias) => country.norm.includes(normalize(alias))));
}

function resolveCommodityIds(snapshot: FpmaDiscoverySnapshot, cropKey: CropKey): { ids: Array<string | number>; label?: string; warnings: string[] } {
  const cropMap = parseCropMap();
  const warnings: string[] = [];
  const config = cropMap[cropKey];
  const configuredIds = config.fpmaCommodityIds
    .map((id) => snapshot.commodities.find((item) => String(item.id) === String(id))?.id)
    .filter((id): id is string | number => id != null);

  const matchedBySynonym = snapshot.commodities
    .filter((item) => config.synonyms.some((synonym) => item.norm.includes(synonym)))
    .map((item) => item.id);

  const ids = Array.from(new Set([...configuredIds, ...matchedBySynonym]));
  if (!configuredIds.length && config.fpmaCommodityIds.length) warnings.push("configured_ids_missing_in_snapshot");
  if (!matchedBySynonym.length) warnings.push("synonym_match_empty");

  return {
    ids,
    label: config.label,
    warnings,
  };
}

function resolvePriceType(snapshot: FpmaDiscoverySnapshot, priceType: PriceType): { id?: string | number; warnings: string[] } {
  const warnings: string[] = [];
  const normalized = priceType.toLowerCase();
  const match = (snapshot.priceTypes || []).find((entry) => entry.norm.includes(normalized));
  if (!match) {
    warnings.push("price_type_id_not_found");
    return { warnings };
  }
  return { id: match.id, warnings };
}

export function resolveFpmaIds(
  snapshot: FpmaDiscoverySnapshot,
  args: { countryCode: string; cropKey: CropKey; priceType: PriceType },
): ResolvedFpmaQuery {
  const cacheKey = `${args.countryCode}:${args.cropKey}:${args.priceType}`;
  const now = Date.now();
  const cached = resolvedCache.get(cacheKey);
  if (cached && now - cached.fetchedAtMs <= FPMA_DISCOVERY_CACHE_TTL_MS) {
    return cached.resolved;
  }

  const warnings: string[] = [];
  const country = resolveCountry(snapshot, args.countryCode);
  const commodity = resolveCommodityIds(snapshot, args.cropKey);
  const priceType = resolvePriceType(snapshot, args.priceType);

  warnings.push(...commodity.warnings, ...priceType.warnings);

  const methodUsed: ResolvedFpmaQuery["methodUsed"] =
    country?.id != null && commodity.ids.length ? "id" : commodity.ids.length ? "token" : "fallback";

  const resolved: ResolvedFpmaQuery = {
    ok: Boolean(country || args.countryCode) && commodity.ids.length > 0,
    country: {
      code: args.countryCode,
      id: country?.id,
      name: country?.name,
    },
    commodity: {
      key: args.cropKey,
      ids: commodity.ids,
      name: commodity.label,
    },
    priceType: {
      name: args.priceType,
      id: priceType.id,
    },
    methodUsed,
    warnings: warnings.length ? Array.from(new Set(warnings)) : undefined,
  };

  resolvedCache.set(cacheKey, { resolved, fetchedAtMs: now });
  return resolved;
}

export function getFpmaDiscoveryDebug(snapshot?: FpmaDiscoverySnapshot): FpmaDiscoveryDebug {
  const cached = snapshotCache;
  return {
    cacheHit: Boolean(cached?.cacheHit),
    stale: Boolean(cached?.stale),
    fetchedAt: snapshot?.fetchedAt || cached?.snapshot?.fetchedAt,
    countriesCount: snapshot?.countries?.length || 0,
    commoditiesCount: snapshot?.commodities?.length || 0,
    priceTypesCount: snapshot?.priceTypes?.length || 0,
    endpointsTried: (snapshot?.endpointsTried || []).slice(0, 5),
    notes: snapshot?.notes,
  };
}

export async function runFpmaDiscoveryResolutionTest(): Promise<Array<{ country: string; crop: CropKey; priceType: PriceType; ok: boolean; idsCount: number; methodUsed: ResolvedFpmaQuery["methodUsed"]; warnings?: string[] }>> {
  const snapshot = await fetchFpmaDiscoverySnapshot();
  const cases: Array<{ country: string; crop: CropKey; priceType: PriceType }> = [
    { country: "UA", crop: "WHEAT", priceType: "WHOLESALE" },
    { country: "US", crop: "WHEAT", priceType: "WHOLESALE" },
    { country: "BR", crop: "WHEAT", priceType: "WHOLESALE" },
    { country: "AR", crop: "WHEAT", priceType: "WHOLESALE" },
    { country: "UA", crop: "MAIZE", priceType: "WHOLESALE" },
  ];

  return cases.map((testCase) => {
    const resolved = resolveFpmaIds(snapshot, {
      countryCode: testCase.country,
      cropKey: testCase.crop,
      priceType: testCase.priceType,
    });
    return {
      country: testCase.country,
      crop: testCase.crop,
      priceType: testCase.priceType,
      ok: resolved.ok,
      idsCount: resolved.commodity.ids?.length || 0,
      methodUsed: resolved.methodUsed,
      warnings: resolved.warnings,
    };
  });
}
