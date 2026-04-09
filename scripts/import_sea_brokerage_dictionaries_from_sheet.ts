import XLSX from "xlsx";
import { storage } from "../server/storage";
import { isoCountryOptionsEn } from "../client/src/features/sea-brokerage-monitor/mock/isoCountryOptions.en";

const SEA_BROKERAGE_COMPANIES_KEY = "sea_brokerage_companies_v1";
const SEA_BROKERAGE_BUYER_COMPANIES_KEY = "sea_brokerage_buyer_companies_v1";
const SEA_BROKERAGE_SELLER_COMPANIES_KEY = "sea_brokerage_seller_companies_v1";
const SEA_BROKERAGE_COUNTRIES_KEY = "sea_brokerage_countries_v1";
const SEA_BROKERAGE_COMMODITIES_KEY = "sea_brokerage_commodities_v1";
const SEA_BROKERAGE_CUSTOM_LOCATIONS_KEY = "sea_brokerage_custom_locations_v1";
const SEA_BROKERAGE_BASIS_KEY = "sea_brokerage_basis_v1";
const ALLOWED_BASIS = new Set(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]);

const DEFAULT_SHEET_URL =
  process.env.SEA_BROKERAGE_DICTIONARIES_SHEET_URL ||
  "https://docs.google.com/spreadsheets/d/1q5Kqu-2ZXPwPdwHPCaA9YPIcV7j4V-8B0hNd6j29YpM/export?format=xlsx";

type CompanyEntry = {
  id: string;
  displayLabel: string;
  compactDisplay: string;
};

type CountryEntry = {
  code: string;
  displayLabel: string;
  countryCodeAlpha3: string;
  compactDisplay: string;
};

type CommodityEntry = {
  code: string;
  displayLabel: string;
  compactDisplay: string;
  group?: "grains" | "oilseeds" | "processed";
  displayLabelUa?: string;
  productGroup?: string;
  productCategory?: string;
  priority?: string;
  certification?: string;
  telegramIcon?: string;
};

type LocationEntry = {
  code: string;
  displayLabel: string;
  countryCode: string;
  countryCodeAlpha3: string;
  compactDisplay: string;
  unlocode?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPANY_LABEL_REGEX = /^(?=.{2,120}$)[A-Za-z0-9"'&().,\/-][A-Za-z0-9\s'"&().,\/-]*$/;

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[Сс]/g, "c")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getRowValue(
  row: Record<string, unknown>,
  expectedHeaders: string[],
) {
  const normalizedExpected = new Set(expectedHeaders.map((item) => normalizeHeaderKey(item)));
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedExpected.has(normalizeHeaderKey(key))) continue;
    const normalizedValue = normalizeText(value);
    if (normalizedValue) return normalizedValue;
  }
  return "";
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildCompanyId(label: string) {
  return `company_${slugify(label) || "company"}`;
}

function buildCommodityCode(label: string) {
  return slugify(label).slice(0, 48) || "commodity";
}

function buildLocationCode(city: string, countryCode: string) {
  return `custom_${slugify(city) || "place"}_${countryCode.toLowerCase()}`;
}

function asRows(sheet: XLSX.WorkSheet): Array<Record<string, unknown>> {
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function parseDestinationRaw(destination: string) {
  const normalized = normalizeText(destination);
  if (!normalized) return [] as Array<{ city: string; countryLabel: string }>;
  const [left, right] = normalized.split(",").map((part) => normalizeText(part));
  if (!left) return [];
  const countryLabel = right || "";
  const cities = left
    .split("|")
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .map((part) => part.replace(/^[-–>]+\s*/, ""));
  return cities.map((city) => ({ city, countryLabel }));
}

function normalizeBasis(value: string) {
  return normalizeText(value).toUpperCase();
}

function classifyCommodityGroupByCategory(
  productCategory: string,
): "grains" | "oilseeds" | "processed" {
  const normalized = normalizeText(productCategory).toLowerCase();
  if (normalized === "grains" || normalized === "legumes" || normalized === "pseudograins") {
    return "grains";
  }
  if (normalized === "oilseeds" || normalized === "oils") return "oilseeds";
  return "processed";
}

const PRODUCT_GROUP_ICON_MAP: Record<string, string> = {
  "by-products|feedstuffs": "🗜️",
  "by-products|flour": "👝",
  "by-products|husk": "🗜️",
  "by-products|rapeseed cake": "🌿⚙️",
  "by-products|rapeseed meal": "🌿⚙️",
  "by-products|soybean cake": "🌱⚙️",
  "by-products|soybean meal": "🌱⚙️",
  "by-products|sugar": "🍚",
  "by-products|sunflower cake": "🌻⚙️",
  "by-products|sunflower meal": "🌻⚙️",
  "by-products|wheat bran": "👝",
  "grains|barley": "🌾",
  "grains|corn": "🌽",
  "grains|oat": "🌾",
  "grains|rye": "🌾",
  "grains|sorghum": "🌾",
  "grains|wheat": "🌾",
  "legumes|beans": "🫘",
  "legumes|chickpea": "🫘",
  "legumes|peas": "🫘",
  "oils|rapeseed oil": "🌿💧",
  "oils|soybeans oil": "🌱💧",
  "oils|sunflower oil": "🌻💧",
  "oilseeds|linseed": "🌸",
  "oilseeds|mustard": "🫘",
  "oilseeds|rapeseeds": "🌿",
  "oilseeds|soybeans": "🌱",
  "oilseeds|sunflower": "🌻",
  "pseudograins|buckweat": "🫘",
  "pseudograins|millet": "🌾",
};

function resolveCommodityIcon(productCategory: string, productGroup: string) {
  const key = `${normalizeText(productCategory).toLowerCase()}|${normalizeText(productGroup).toLowerCase()}`;
  return PRODUCT_GROUP_ICON_MAP[key] || "";
}

function pickRowValuesByHeader(
  row: Record<string, unknown>,
  expectedHeaders: string[],
): string[] {
  const normalizedExpected = new Set(expectedHeaders.map((item) => normalizeHeaderKey(item)));
  const values: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedExpected.has(normalizeHeaderKey(key))) continue;
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) continue;
    values.push(normalizedValue);
  }
  return values;
}

async function main() {
  console.log(`[SeaBrokerage Import] Loading workbook from ${DEFAULT_SHEET_URL}`);
  const response = await fetch(DEFAULT_SHEET_URL);
  if (!response.ok) {
    throw new Error(`Failed to download sheet: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheets = workbook.SheetNames;
  console.log(`[SeaBrokerage Import] Sheets: ${sheets.join(", ")}`);

  const bids = workbook.Sheets["📁 BIDS"] ? asRows(workbook.Sheets["📁 BIDS"]) : [];
  const offers = workbook.Sheets["📁 OFFERS"] ? asRows(workbook.Sheets["📁 OFFERS"]) : [];
  const buyers = workbook.Sheets["🔹Buyers"] ? asRows(workbook.Sheets["🔹Buyers"]) : [];
  const sellers = workbook.Sheets["🔸Sellers"] ? asRows(workbook.Sheets["🔸Sellers"]) : [];
  const entities = workbook.Sheets["🔸Entities"] ? asRows(workbook.Sheets["🔸Entities"]) : [];
  const dictionary = workbook.Sheets["🔍 Довідник"] ? asRows(workbook.Sheets["🔍 Довідник"]) : [];

  const countryByName = new Map(
    isoCountryOptionsEn.map((country) => [country.displayLabel.toLowerCase(), country]),
  );

  const companiesByLabel = new Map<string, CompanyEntry>();
  const buyerCompaniesByLabel = new Map<string, CompanyEntry>();
  const sellerCompaniesByLabel = new Map<string, CompanyEntry>();
  const commoditiesByCode = new Map<string, CommodityEntry>();
  const countriesByCode = new Map<string, CountryEntry>();
  const locationsByCode = new Map<string, LocationEntry>();
  const basisSet = new Set<string>(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]);

  const registerCompany = (raw: unknown) => {
    const label = normalizeText(raw);
    if (!label) return;
    if (!COMPANY_LABEL_REGEX.test(label)) return;
    const key = label.toLowerCase();
    if (companiesByLabel.has(key)) return;
    companiesByLabel.set(key, {
      id: buildCompanyId(label),
      displayLabel: label,
      compactDisplay: label.toUpperCase(),
    });
  };
  const registerBuyerCompany = (raw: unknown) => {
    const label = normalizeText(raw);
    if (!label) return;
    if (!COMPANY_LABEL_REGEX.test(label)) return;
    const key = label.toLowerCase();
    if (buyerCompaniesByLabel.has(key)) return;
    buyerCompaniesByLabel.set(key, {
      id: buildCompanyId(label),
      displayLabel: label,
      compactDisplay: label.toUpperCase(),
    });
    registerCompany(label);
  };
  const registerSellerCompany = (raw: unknown) => {
    const label = normalizeText(raw);
    if (!label) return;
    if (!COMPANY_LABEL_REGEX.test(label)) return;
    const key = label.toLowerCase();
    if (sellerCompaniesByLabel.has(key)) return;
    sellerCompaniesByLabel.set(key, {
      id: buildCompanyId(label),
      displayLabel: label,
      compactDisplay: label.toUpperCase(),
    });
    registerCompany(label);
  };

  const registerCommodityFromDictionary = (row: Record<string, unknown>) => {
    const label = getRowValue(row, ["Commodity"]);
    if (!label || normalizeHeaderKey(label) === "commodity") return;
    const displayLabelUa = getRowValue(row, ["Commodity (UA)"]);
    const productGroup = getRowValue(row, ["Product Group"]);
    const productCategory = getRowValue(row, ["Product Category"]);
    const priority = getRowValue(row, ["Priority"]);
    const certification = getRowValue(row, ["Certification"]);
    const code = buildCommodityCode(label);
    const existing = commoditiesByCode.get(code);
    if (existing) {
      if (!existing.displayLabelUa && displayLabelUa) existing.displayLabelUa = displayLabelUa;
      if (!existing.productGroup && productGroup) existing.productGroup = productGroup;
      if (!existing.productCategory && productCategory) existing.productCategory = productCategory;
      if (!existing.priority && priority) existing.priority = priority;
      if (!existing.certification && certification) existing.certification = certification;
      if (!existing.telegramIcon) existing.telegramIcon = resolveCommodityIcon(productCategory, productGroup);
      return;
    }
    commoditiesByCode.set(code, {
      code,
      displayLabel: label,
      compactDisplay: label.toUpperCase(),
      group: classifyCommodityGroupByCategory(productCategory),
      displayLabelUa: displayLabelUa || undefined,
      productGroup: productGroup || undefined,
      productCategory: productCategory || undefined,
      priority: priority || undefined,
      certification: certification || undefined,
      telegramIcon: resolveCommodityIcon(productCategory, productGroup) || undefined,
    });
  };

  const registerCountry = (raw: unknown) => {
    const displayLabel = normalizeText(raw);
    if (!displayLabel) return null;
    const match = countryByName.get(displayLabel.toLowerCase());
    if (!match) return null;
    countriesByCode.set(match.code, {
      code: match.code,
      displayLabel: match.displayLabel,
      countryCodeAlpha3: match.countryCodeAlpha3,
      compactDisplay: match.compactDisplay,
    });
    return match;
  };

  const registerLocation = (cityRaw: unknown, countryRaw: unknown) => {
    const city = normalizeText(cityRaw);
    if (!city) return;
    const country = registerCountry(countryRaw);
    if (!country) return;
    const code = buildLocationCode(city, country.code);
    if (locationsByCode.has(code)) return;
    locationsByCode.set(code, {
      code,
      displayLabel: city,
      countryCode: country.code,
      countryCodeAlpha3: country.countryCodeAlpha3,
      compactDisplay: city.toUpperCase(),
    });
  };

  const registerDestination = (destinationRaw: unknown, countryRaw: unknown) => {
    const destination = normalizeText(destinationRaw);
    if (!destination) return;
    const parsed = parseDestinationRaw(destination);
    if (!parsed.length) return;
    for (const item of parsed) {
      registerLocation(item.city, item.countryLabel || countryRaw);
    }
  };

  const registerBasis = (raw: unknown) => {
    const basis = normalizeBasis(String(raw || ""));
    if (!basis || basis === "BASIS") return;
    if (!ALLOWED_BASIS.has(basis)) return;
    basisSet.add(basis);
  };

  for (const row of buyers) {
    for (const value of pickRowValuesByHeader(row, ["Company Group", "Company name (EN)"])) {
      registerBuyerCompany(value);
    }
  }
  for (const row of sellers) {
    for (const value of pickRowValuesByHeader(row, ["Company Group", "Company name (EN)"])) {
      registerSellerCompany(value);
    }
  }
  for (const row of entities) {
    for (const value of pickRowValuesByHeader(row, ["Company Group", "Company name (EN)"])) {
      registerSellerCompany(value);
    }
  }

  for (const row of bids) {
    registerBuyerCompany(row["Buyer"]);
    registerCountry(row["Country"]);
    registerDestination(row["Destination"], row["Country"]);
    registerBasis(row["Basis"]);
  }
  for (const row of offers) {
    registerSellerCompany(row["Seller"] || row["Buyer"]);
    registerCountry(row["Country"]);
    registerDestination(row["Destination"], row["Country"]);
    registerBasis(row["Basis"]);
  }
  for (const row of dictionary) {
    registerCommodityFromDictionary(row);
    registerCountry(row["Country"]);
    registerDestination(row["Destination"], row["Country"]);
    registerBasis(row["Basis"]);
  }

  const companies = Array.from(companiesByLabel.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
  const buyerCompanies = Array.from(buyerCompaniesByLabel.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
  const sellerCompanies = Array.from(sellerCompaniesByLabel.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
  const priorityOrder = new Map([
    ["1st", 1],
    ["2nd", 2],
    ["3rd", 3],
    ["4th", 4],
  ]);
  const commodities = Array.from(commoditiesByCode.values()).sort((a, b) => {
    const cat = String(a.productCategory || "").localeCompare(String(b.productCategory || ""));
    if (cat !== 0) return cat;
    const grp = String(a.productGroup || "").localeCompare(String(b.productGroup || ""));
    if (grp !== 0) return grp;
    const pa = priorityOrder.get(String(a.priority || "")) ?? 99;
    const pb = priorityOrder.get(String(b.priority || "")) ?? 99;
    if (pa !== pb) return pa - pb;
    return a.displayLabel.localeCompare(b.displayLabel);
  });
  const countries = Array.from(countriesByCode.values()).sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel),
  );
  const locations = Array.from(locationsByCode.values()).sort((a, b) => {
    const left = `${a.displayLabel}, ${a.countryCode}`;
    const right = `${b.displayLabel}, ${b.countryCode}`;
    return left.localeCompare(right);
  });
  const basis = Array.from(ALLOWED_BASIS.values()).filter((value) => basisSet.has(value));

  await storage.upsertAppSetting(SEA_BROKERAGE_COMPANIES_KEY, JSON.stringify(companies));
  await storage.upsertAppSetting(
    SEA_BROKERAGE_BUYER_COMPANIES_KEY,
    JSON.stringify(buyerCompanies),
  );
  await storage.upsertAppSetting(
    SEA_BROKERAGE_SELLER_COMPANIES_KEY,
    JSON.stringify(sellerCompanies),
  );
  await storage.upsertAppSetting(SEA_BROKERAGE_COMMODITIES_KEY, JSON.stringify(commodities));
  await storage.upsertAppSetting(SEA_BROKERAGE_COUNTRIES_KEY, JSON.stringify(countries));
  await storage.upsertAppSetting(SEA_BROKERAGE_CUSTOM_LOCATIONS_KEY, JSON.stringify(locations));
  await storage.upsertAppSetting(SEA_BROKERAGE_BASIS_KEY, JSON.stringify(basis));

  console.log(
    `[SeaBrokerage Import] Imported: companies=${companies.length}, commodities=${commodities.length}, countries=${countries.length}, locations=${locations.length}, basis=${basis.length}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[SeaBrokerage Import] Failed:", error);
    process.exit(1);
  });
