import {
  formatEntryDestinationCompactDisplay,
  getBasisCompactDisplay,
  getCommodityCompactDisplay,
  getCountryCompactDisplay,
  normalizePeriodCompactLabel,
} from "./displayStandards";
import type { BrokerageEntry, Currency } from "../types";

function getCurrencySymbol(currency: Currency) {
  if (currency === "EUR") return "€";
  if (currency === "UAH") return "₴";
  return "$";
}

export function formatEntryTimestampCompact(value: string) {
  return `${formatEntryDateCompact(value)} / ${formatEntryTimeCompact(value)}`;
}

export function formatEntryDateCompact(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

export function formatEntryTimeCompact(value: string) {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
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

export function formatEntryQuantityTape(entry: BrokerageEntry) {
  const quantity =
    entry.quantityMt !== null && entry.quantityMt !== undefined
      ? entry.quantityMt
      : entry.volumeFrom === entry.volumeTo
        ? entry.volumeFrom
        : Math.round((entry.volumeFrom + entry.volumeTo) / 2);

  return `${quantity}`.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
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

export function formatEntryPriceTape(entry: BrokerageEntry) {
  const resolvedPrice =
    entry.price ?? (entry.priceFrom !== null ? entry.priceFrom : entry.priceTo);

  if (resolvedPrice === null || resolvedPrice === undefined) {
    return "@ subject";
  }

  const currencySymbol = getCurrencySymbol(entry.currency);

  if (
    entry.price === null &&
    entry.priceFrom !== null &&
    entry.priceTo !== null &&
    entry.priceFrom !== entry.priceTo
  ) {
    return `@ ${entry.priceFrom}-${entry.priceTo}${currencySymbol}`;
  }

  return `@ ${resolvedPrice}${currencySymbol}`;
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
  return formatEntryDestinationCompactDisplay(entry);
}

export function formatEntryDeliveryCompact(entry: BrokerageEntry) {
  return `${getBasisCompactDisplay(entry.basis)} ${formatEntryDestinationCompact(entry)}`;
}

export function formatEntryOriginCompact(entry: BrokerageEntry) {
  return getCountryCompactDisplay(entry.originCountryCode ?? entry.originCountry);
}

export function formatEntryBrokerIdentityCompact(entry: BrokerageEntry) {
  return entry.brokerCode;
}

export function formatEntryCommodityCompact(entry: BrokerageEntry) {
  return getCommodityCompactDisplay(entry.commodity, entry.commodityLabel);
}

export function formatEntryCommodityTape(entry: BrokerageEntry) {
  return formatEntryCommodityCompact(entry).replace(/\./g, ",");
}

export function normalizePeriodLabel(input: {
  periodType?: BrokerageEntry["periodType"] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
}) {
  return normalizePeriodCompactLabel(input);
}

export function formatEntryPeriodCompact(entry: BrokerageEntry) {
  return normalizePeriodLabel({
    periodType: entry.periodType,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    periodLabel: entry.periodLabel,
  });
}

export function formatEntryPeriodTape(entry: BrokerageEntry) {
  if (entry.periodStart && entry.periodEnd) {
    const start = formatShortDateSlash(entry.periodStart);
    const end = formatShortDateSlash(entry.periodEnd);
    return start === end ? start : `${start}-${end}`;
  }

  return formatEntryPeriodCompact(entry);
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

function formatShortDateSlash(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function buildCanonicalView(entry: Omit<BrokerageEntry, "canonicalView">) {
  return buildTapeLine(entry as BrokerageEntry);
}

export function buildTapeLine(entry: BrokerageEntry) {
  return [
    formatEntryDateCompact(entry.createdAt),
    formatEntryTimeCompact(entry.createdAt),
    formatEntryBrokerIdentityCompact(entry),
    `${formatEntryCommodityTape(entry)} ${formatEntryQuantityTape(entry)} ${formatEntryDeliveryCompact(entry)} ${formatEntryPeriodTape(entry)} ${formatEntryPriceTape(entry)}`,
  ].join(" / ");
}

export function buildCompactCanonicalView(entry: BrokerageEntry) {
  return buildTapeLine(entry);
}
