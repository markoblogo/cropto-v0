import type { SeaBrokerageEntryRow } from "@shared/schema";

const ALPHA3_TO_ALPHA2: Record<string, string> = {
  UKR: "UA",
  ESP: "ES",
  EGY: "EG",
  TUR: "TR",
  ROU: "RO",
  MDA: "MD",
  BGR: "BG",
  ISR: "IL",
  CYP: "CY",
  LBN: "LB",
  ITA: "IT",
  DEU: "DE",
  GER: "DE",
};

const COUNTRY_NAME_TO_ALPHA2: Record<string, string> = {
  UKRAINE: "UA",
  SPAIN: "ES",
  EGYPT: "EG",
  TURKEY: "TR",
  ROMANIA: "RO",
  MOLDOVA: "MD",
  BULGARIA: "BG",
  ISRAEL: "IL",
  CYPRUS: "CY",
  LEBANON: "LB",
  ITALY: "IT",
  GERMANY: "DE",
};

function normalizeCountryAlpha2(rawCode: string | null | undefined, fallbackCountryName: string | null | undefined) {
  const normalizedCode = String(rawCode || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalizedCode)) return normalizedCode;
  if (/^[A-Z]{3}$/.test(normalizedCode) && ALPHA3_TO_ALPHA2[normalizedCode]) {
    return ALPHA3_TO_ALPHA2[normalizedCode];
  }

  const normalizedName = String(fallbackCountryName || "").trim().toUpperCase();
  if (normalizedName && COUNTRY_NAME_TO_ALPHA2[normalizedName]) {
    return COUNTRY_NAME_TO_ALPHA2[normalizedName];
  }

  return normalizedCode || normalizedName || "N/A";
}

function normalizeDestinationPort(entry: SeaBrokerageEntryRow, uppercase: boolean) {
  const raw = String(entry.destinationPort || "").trim();
  if (!raw) {
    const fallback = String(entry.destinationPortCode || "").trim();
    return uppercase ? fallback.toUpperCase() : fallback;
  }
  const normalized = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
  return uppercase ? normalized.toUpperCase() : normalized;
}

export function formatSeaBrokerageBasisRoute(
  entry: SeaBrokerageEntryRow,
  options?: { uppercase?: boolean; countryMode?: "alpha2" | "name" },
) {
  const uppercase = options?.uppercase ?? true;
  const countryMode = options?.countryMode ?? "alpha2";

  const basis = uppercase ? String(entry.basis || "").trim().toUpperCase() : String(entry.basis || "").trim();
  const port = normalizeDestinationPort(entry, uppercase);

  const country =
    countryMode === "name"
      ? uppercase
        ? String(entry.destinationCountry || "").trim().toUpperCase()
        : String(entry.destinationCountry || "").trim()
      : normalizeCountryAlpha2(entry.destinationCountryCode, entry.destinationCountry);

  if (!country) return `${basis} ${port}`.trim();
  return `${basis} ${port}, ${country}`.trim();
}

export function resolveSeaBrokerageCountryAlpha2(
  entry: SeaBrokerageEntryRow,
  rawCode: string | null | undefined,
) {
  return normalizeCountryAlpha2(rawCode, entry.destinationCountry);
}
