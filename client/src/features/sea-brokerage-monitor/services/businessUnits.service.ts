import type { BrokerageEntry } from "../types";

export type BusinessUnitCode =
  | "ua_office"
  | "international"
  | "italy"
  | "turkey"
  | "germany"
  | "argentina";

export const businessUnitOptions: Array<{ value: BusinessUnitCode; label: string }> = [
  { value: "ua_office", label: "Ukrainian office" },
  { value: "international", label: "International" },
  { value: "italy", label: "Italy" },
  { value: "turkey", label: "Turkey" },
  { value: "germany", label: "Germany" },
  { value: "argentina", label: "Argentina" },
];

const brokerCodeToBusinessUnit: Record<string, BusinessUnitCode> = {
  OS: "ua_office",
  ABV: "ua_office",
  VZH: "ua_office",
  VTTL: "ua_office",
  AN: "ua_office",
  IN: "ua_office",
  SK: "ua_office",
  BSC: "international",
  DELTA: "international",
  NORTH: "international",
};

function normalizeKey(value: string | null | undefined) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function inferBusinessUnitByCompanyName(companyName: string | null | undefined): BusinessUnitCode {
  const normalized = String(companyName || "").toLowerCase();
  if (normalized.includes("ital")) return "italy";
  if (normalized.includes("turk")) return "turkey";
  if (normalized.includes("german")) return "germany";
  if (normalized.includes("argentin")) return "argentina";
  if (normalized.includes("international")) return "international";
  return "ua_office";
}

export function resolveEntryBusinessUnitCode(entry: BrokerageEntry): BusinessUnitCode {
  const byBrokerCode = brokerCodeToBusinessUnit[normalizeKey(entry.brokerCode)];
  if (byBrokerCode) {
    return byBrokerCode;
  }
  return inferBusinessUnitByCompanyName(entry.companyName);
}

