import { getCommodityCompactLabel, getCountryAlpha3 } from "../mock/dictionaries";
import type { BrokerageEntry, Currency } from "../types";

const COMPACT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export function formatEntryTimestampCompact(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month} / ${hours}:${minutes}`;
}

export function formatEntryDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatEntryChartDay(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatEntryVolumeCompact(volumeFrom: number, volumeTo: number) {
  const averageVolume = volumeFrom === volumeTo ? volumeFrom : (volumeFrom + volumeTo) / 2;

  if (averageVolume >= 1000) {
    const compact = averageVolume / 1000;
    return Number.isInteger(compact) ? `${compact}k` : `${compact.toFixed(1)}k`;
  }

  return `${averageVolume}`;
}

export function formatEntryVolumeRange(entry: BrokerageEntry) {
  if (entry.quantityMt !== null && entry.quantityMt !== undefined) {
    const quantityLabel = `${entry.quantityMt} ${entry.volumeUnit.toUpperCase()}`;
    if (entry.tolerancePct !== null && entry.tolerancePct !== undefined && entry.tolerancePct > 0) {
      return `${quantityLabel} (+/- ${entry.tolerancePct}%)`;
    }
    return quantityLabel;
  }

  return `${entry.volumeFrom}-${entry.volumeTo} ${entry.volumeUnit.toUpperCase()}`;
}

export function formatEntryQuantityCompact(
  entry: BrokerageEntry,
  options?: { includeTolerance?: boolean },
) {
  const includeTolerance = options?.includeTolerance ?? false;

  let quantityLabel: string;

  if (entry.quantityMt !== null && entry.quantityMt !== undefined) {
    if (entry.quantityMt >= 1000) {
      const compact = entry.quantityMt / 1000;
      quantityLabel = Number.isInteger(compact) ? `${compact}k` : `${compact.toFixed(1)}k`;
    } else {
      quantityLabel = `${entry.quantityMt}`;
    }
  } else {
    quantityLabel = formatEntryVolumeCompact(entry.volumeFrom, entry.volumeTo);
  }

  if (
    includeTolerance &&
    entry.tolerancePct !== null &&
    entry.tolerancePct !== undefined &&
    entry.tolerancePct > 0
  ) {
    return `${quantityLabel} +/-${entry.tolerancePct}%`;
  }

  return quantityLabel;
}

export function formatPriceCompact(
  price: number | null | undefined,
  priceFrom: number | null,
  priceTo: number | null,
  currency: Currency,
) {
  if (price !== null && price !== undefined) {
    return `@${price} ${currency}`;
  }

  const resolvedPrice = priceFrom ?? priceTo;

  if (resolvedPrice === null) {
    return `subject ${currency}`;
  }

  if (priceFrom !== null && priceTo !== null && priceFrom !== priceTo) {
    return `@${priceFrom}-${priceTo} ${currency}`;
  }

  return `@${resolvedPrice} ${currency}`;
}

export function formatEntryPriceRange(entry: BrokerageEntry) {
  if (entry.price !== null && entry.price !== undefined) {
    return `${entry.price}`;
  }

  if (entry.priceFrom !== null && entry.priceTo !== null && entry.priceFrom !== entry.priceTo) {
    return `${entry.priceFrom}-${entry.priceTo}`;
  }

  return `${entry.priceFrom ?? entry.priceTo ?? "N/A"}`;
}

export function formatEntryDestination(entry: BrokerageEntry) {
  return `${entry.destinationPort}, ${entry.destinationCountry}`;
}

export function formatEntryDestinationCompact(entry: BrokerageEntry) {
  return `${entry.destinationPort}, ${getCountryAlpha3(
    entry.destinationCountryCode ?? entry.destinationCountry,
  )}`;
}

export function formatEntryDeliveryCompact(entry: BrokerageEntry) {
  return `${entry.basis} ${formatEntryDestinationCompact(entry)}`;
}

export function formatEntryOriginCompact(entry: BrokerageEntry) {
  return getCountryAlpha3(entry.originCountryCode ?? entry.originCountry);
}

export function formatEntryBrokerIdentityCompact(entry: BrokerageEntry) {
  return entry.brokerCode;
}

export function formatEntryCommodityCompact(entry: BrokerageEntry) {
  return getCommodityCompactLabel(entry.commodity, entry.commodityLabel);
}

export function normalizePeriodLabel(input: {
  periodType?: BrokerageEntry["periodType"] | null;
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

      if (
        (normalizedRaw.includes("LH") || normalizedRaw.includes("LAST")) &&
        end.getDate() === lastDay
      ) {
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

export function formatEntryPeriodCompact(entry: BrokerageEntry) {
  return normalizePeriodLabel({
    periodType: entry.periodType,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    periodLabel: entry.periodLabel,
  });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
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

export function buildCanonicalView(entry: Omit<BrokerageEntry, "canonicalView">) {
  return [
    formatEntryTimestampCompact(entry.createdAt),
    formatEntryBrokerIdentityCompact(entry as BrokerageEntry),
    formatEntryCommodityCompact(entry as BrokerageEntry),
    formatEntryQuantityCompact(entry as BrokerageEntry),
    formatEntryDeliveryCompact(entry as BrokerageEntry),
    formatEntryPeriodCompact(entry as BrokerageEntry),
    formatPriceCompact(entry.price, entry.priceFrom, entry.priceTo, entry.currency),
  ].join(" / ");
}

export function buildCompactCanonicalView(entry: BrokerageEntry) {
  return [
    formatEntryTimestampCompact(entry.createdAt),
    formatEntryBrokerIdentityCompact(entry),
    formatEntryCommodityCompact(entry),
    formatEntryQuantityCompact(entry),
    formatEntryDeliveryCompact(entry),
    formatEntryPeriodCompact(entry),
    `${formatEntryPriceRange(entry)} ${entry.currency}`,
  ].join(" / ");
}
