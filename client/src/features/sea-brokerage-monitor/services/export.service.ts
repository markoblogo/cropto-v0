import * as XLSX from "xlsx";
import type { BrokerageEntry } from "../types";
import { getCountryAlpha3 } from "../mock/dictionaries";
import {
  formatEntryDateTime,
  formatEntryPriceRange,
  formatEntryVolumeRange,
} from "./entryFormatting.service";

interface ExportRow {
  date: string;
  type: string;
  "broker code": string;
  "broker name": string;
  seller: string;
  buyer: string;
  commodity: string;
  origin: string;
  "grade/spec": string;
  volume: string;
  tolerance: string;
  basis: string;
  "payment terms": string;
  "delivery place": string;
  "delivery country": string;
  "period label": string;
  price: string;
  currency: string;
  "transport type": string;
  note: string;
  "canonical view": string;
}

function createFilename(extension: "csv" | "xlsx") {
  const date = new Date().toISOString().slice(0, 10);
  return `sea-brokerage-monitor-${date}.${extension}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildExportRows(entries: BrokerageEntry[]): ExportRow[] {
  return entries.map((entry) => ({
    date: formatEntryDateTime(entry.createdAt),
    type: entry.type.toUpperCase(),
    "broker code": entry.brokerCode,
    "broker name": entry.brokerName,
    seller: entry.sellerName ?? "",
    buyer: entry.buyerName ?? "",
    commodity: entry.commodityLabel,
    origin: getCountryAlpha3(entry.originCountryCode ?? entry.originCountry),
    "grade/spec": entry.gradeOrSpec,
    volume: formatEntryVolumeRange(entry),
    tolerance:
      entry.tolerancePct !== null && entry.tolerancePct !== undefined ? `${entry.tolerancePct}%` : "",
    basis: entry.basis,
    "payment terms": entry.paymentTerms ?? "",
    "delivery place": entry.destinationPort,
    "delivery country": getCountryAlpha3(
      entry.destinationCountryCode ?? entry.destinationCountry,
    ),
    "period label": entry.periodLabel,
    price: formatEntryPriceRange(entry),
    currency: entry.currency,
    "transport type": entry.transportType,
    note: entry.note ?? "",
    "canonical view": entry.canonicalView,
  }));
}

export function exportEntriesToCsv(entries: BrokerageEntry[]) {
  const rows = buildExportRows(entries);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), createFilename("csv"));
}

export function exportEntriesToXlsx(entries: BrokerageEntry[]) {
  const rows = buildExportRows(entries);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sea Brokerage Feed");
  const workbookArray = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([workbookArray], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    createFilename("xlsx"),
  );
}
