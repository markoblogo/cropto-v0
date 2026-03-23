import type { BrokerageEntry, Currency } from "../types";

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

export function formatEntryDeliveryCompact(entry: BrokerageEntry) {
  return `${entry.basis} ${entry.destinationPort}, ${entry.destinationCountry}`;
}

export function formatEntryBrokerIdentityCompact(entry: BrokerageEntry) {
  return entry.brokerCode;
}

export function formatEntryPeriodCompact(entry: BrokerageEntry) {
  if (entry.periodStart && entry.periodEnd) {
    const start = formatShortDate(entry.periodStart);
    const end = formatShortDate(entry.periodEnd);
    return start === end ? start : `${start}-${end}`;
  }

  if (entry.periodStart) {
    return `from ${formatShortDate(entry.periodStart)}`;
  }

  if (entry.periodEnd) {
    return `to ${formatShortDate(entry.periodEnd)}`;
  }

  return entry.periodLabel;
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

export function buildCanonicalView(entry: Omit<BrokerageEntry, "canonicalView">) {
  return [
    formatEntryTimestampCompact(entry.createdAt),
    `${entry.brokerCode} (${entry.brokerName})`,
    entry.commodityLabel.toUpperCase(),
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
    entry.commodityLabel.toUpperCase(),
    formatEntryQuantityCompact(entry),
    formatEntryDeliveryCompact(entry),
    formatEntryPeriodCompact(entry),
    `${formatEntryPriceRange(entry)} ${entry.currency}`,
  ].join(" / ");
}
