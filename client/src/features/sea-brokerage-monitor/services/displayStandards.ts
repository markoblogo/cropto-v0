import {
  commodityOptionMap,
  commodityOptions,
  countryOptionMap,
  countryOptions,
  paymentTermOptions,
  portOptionMap,
  portOptions,
} from "../mock/dictionaries";
import type {
  BrokerageEntry,
  CommodityCode,
  PaymentTermCode,
  PeriodType,
} from "../types";

const COMPACT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

// Central compact-display rules for Sea Brokerage Monitor.
//
// Why this exists:
// - The monitor is a broker workspace, so compact output must stay fast to scan
//   and must not drift into mixed human-readable formats over time.
// - Selection UI and filters can stay readable (`displayLabel`) because brokers
//   choose values faster from plain language than from dense market codes.
// - Compact operational views intentionally use normalized forms:
//   - countries -> Alpha-3 (`UKR`, `EGY`) for short, internationally familiar display
//   - ports/places -> UN/LOCODE when explicitly mapped, otherwise dictionary-backed
//     uppercase compact display, so we never invent fake official codes
//   - commodities/payment terms -> controlled compact forms (`CORN`, `CAD`)
//   - periods -> one brokerage-style notation (`SPOT`, `PROMPT`, `1H APR`)
//
// Use this module whenever a value is rendered into tape rows, matching rows,
// compact summaries, exports, or any future operational surface.
export const seaBrokerageMonitorDisplayStandards = {
  countries: "Use Alpha-3 codes in compact operational output.",
  ports:
    "Use UN/LOCODE when explicitly mapped; otherwise use dictionary compactDisplay with Alpha-3 country code.",
  commodities: "Use standardized uppercase compactDisplay values.",
  basis: "Use controlled short basis codes only.",
  paymentTerms: "Use controlled short payment term codes in compact output.",
  periods: "Use normalized brokerage-style compact period notation only.",
} as const;

export function getCountryDisplayLabel(countryCode: string | null | undefined) {
  if (!countryCode) return "";
  const normalized = countryCode.toUpperCase();
  const byCode = countryOptionMap[normalized];
  if (byCode) return byCode.displayLabel;

  const byAlpha3 = countryOptions.find((country) => country.countryCodeAlpha3 === normalized);
  if (byAlpha3) return byAlpha3.displayLabel;

  const byLabel = countryOptions.find(
    (country) => country.displayLabel.toLowerCase() === countryCode.toLowerCase(),
  );
  return byLabel?.displayLabel ?? countryCode;
}

export function getCountryCompactDisplay(countryCode: string | null | undefined) {
  if (!countryCode) return "";
  const normalized = countryCode.toUpperCase();
  const byCode = countryOptionMap[normalized];
  if (byCode) return byCode.compactDisplay;

  const byAlpha3 = countryOptions.find((country) => country.countryCodeAlpha3 === normalized);
  if (byAlpha3) return byAlpha3.compactDisplay;

  const byLabel = countryOptions.find(
    (country) => country.displayLabel.toLowerCase() === countryCode.toLowerCase(),
  );
  return byLabel?.compactDisplay ?? normalized;
}

export function getCommodityDisplayLabel(
  commodityCode: CommodityCode | string | null | undefined,
  fallbackLabel?: string | null,
) {
  if (!commodityCode && !fallbackLabel) return "";

  if (commodityCode && commodityOptionMap[commodityCode as CommodityCode]) {
    return commodityOptionMap[commodityCode as CommodityCode].displayLabel;
  }

  if (fallbackLabel) {
    const byLabel = commodityOptions.find(
      (commodity) => commodity.displayLabel.toLowerCase() === fallbackLabel.toLowerCase(),
    );
    if (byLabel) return byLabel.displayLabel;
  }

  return fallbackLabel ?? commodityCode ?? "";
}

export function getCommodityCompactDisplay(
  commodityCode: CommodityCode | string | null | undefined,
  fallbackLabel?: string | null,
) {
  if (!commodityCode && !fallbackLabel) return "";

  if (commodityCode && commodityOptionMap[commodityCode as CommodityCode]) {
    return commodityOptionMap[commodityCode as CommodityCode].compactDisplay;
  }

  if (fallbackLabel) {
    const byLabel = commodityOptions.find(
      (commodity) => commodity.displayLabel.toLowerCase() === fallbackLabel.toLowerCase(),
    );
    if (byLabel) return byLabel.compactDisplay;
  }

  return (fallbackLabel ?? commodityCode ?? "").toUpperCase().replace("%", "").trim();
}

export function getPortPlaceDisplayLabel(portCode: string | null | undefined) {
  if (!portCode) return "";
  const port = portOptionMap[portCode];
  if (!port) return portCode;
  return `${port.displayLabel}, ${getCountryDisplayLabel(port.countryCode)}`;
}

export function getPortPlaceCompactDisplay(portCode: string | null | undefined) {
  if (!portCode) return "";
  const port = portOptionMap[portCode];
  if (!port) {
    const normalized = portCode.toUpperCase();
    if (normalized.startsWith("CUSTOM_")) return "";
    return normalized;
  }
  if (port.unlocode) return port.unlocode;
  return `${port.compactDisplay}, ${port.countryCodeAlpha3}`;
}

export function getPaymentTermDisplayLabel(paymentTermCode: PaymentTermCode | string | null | undefined) {
  if (!paymentTermCode) return "";
  const normalized = paymentTermCode.toUpperCase();
  const option = paymentTermOptions.find((item) => item.code === normalized);
  return option?.displayLabel ?? paymentTermCode;
}

export function getPaymentTermCompactDisplay(paymentTermCode: PaymentTermCode | string | null | undefined) {
  if (!paymentTermCode) return "";
  const normalized = paymentTermCode.toUpperCase();
  const option = paymentTermOptions.find((item) => item.code === normalized);
  return option?.compactDisplay ?? normalized;
}

export function getBasisCompactDisplay(basis: string | null | undefined) {
  return (basis ?? "").toUpperCase();
}

export function normalizePeriodCompactLabel(input: {
  periodType?: PeriodType | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
}) {
  const rawLabel = (input.periodLabel ?? "").trim();
  const normalizedRaw = rawLabel.toUpperCase();

  if (input.periodType === "spot" || normalizedRaw === "SPOT") {
    return "SPOT";
  }

  if (input.periodType === "prompt" || normalizedRaw === "PROMPT") {
    return "PROMPT";
  }

  const start = parseDateInput(input.periodStart);
  const end = parseDateInput(input.periodEnd);

  if (start && end) {
    if (isSameMonth(start, end)) {
      const month = formatMonthCompact(start);
      const lastDay = getMonthLastDay(start);

      if (start.getDate() === 1 && end.getDate() === 15) {
        return `1H ${month}`;
      }

      if (start.getDate() === 16 && end.getDate() === lastDay) {
        return `2H ${month}`;
      }

      if ((normalizedRaw.includes("LH") || normalizedRaw.includes("LAST")) && end.getDate() === lastDay) {
        return `LH ${month}`;
      }
    }

    return `${formatDayMonthCompact(start)} - ${formatDayMonthCompact(end)}`;
  }

  if (normalizedRaw.includes("1H")) {
    const month = extractMonthFromRaw(normalizedRaw);
    return month ? `1H ${month}` : "1H";
  }

  if (normalizedRaw.includes("2H")) {
    const month = extractMonthFromRaw(normalizedRaw);
    return month ? `2H ${month}` : "2H";
  }

  if (normalizedRaw.includes("LH") || normalizedRaw.includes("LAST")) {
    const month = extractMonthFromRaw(normalizedRaw);
    return month ? `LH ${month}` : "LH";
  }

  return normalizedRaw || "OPEN";
}

export function formatEntryDestinationCompactDisplay(entry: BrokerageEntry) {
  const destinationPortCodes =
    Array.isArray(entry.destinationPortCodes) && entry.destinationPortCodes.length
      ? entry.destinationPortCodes
      : String(entry.destinationPortCode || "")
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean);
  const primaryPortCode = destinationPortCodes[0];

  if (primaryPortCode) {
    const compactByCode = getPortPlaceCompactDisplay(primaryPortCode);
    if (compactByCode) {
      return destinationPortCodes.length > 1
        ? `${compactByCode} +${destinationPortCodes.length - 1}`
        : compactByCode;
    }
  }

  const compactPort = (entry.destinationPort ?? "").toUpperCase();
  const compactCountry = getCountryCompactDisplay(
    entry.destinationCountryCode ?? entry.destinationCountry,
  );

  if (compactPort && compactCountry) {
    return `${compactPort}, ${compactCountry}`;
  }

  return compactPort || compactCountry;
}

function formatMonthCompact(date: Date) {
  return COMPACT_MONTHS[date.getMonth()];
}

function formatDayMonthCompact(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${formatMonthCompact(date)}`;
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function getMonthLastDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function extractMonthFromRaw(value: string) {
  return COMPACT_MONTHS.find((month) => value.includes(month));
}
