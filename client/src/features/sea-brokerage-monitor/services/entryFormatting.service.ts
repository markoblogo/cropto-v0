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
  return `${entry.volumeFrom}-${entry.volumeTo} ${entry.volumeUnit.toUpperCase()}`;
}

export function formatPriceCompact(
  priceFrom: number | null,
  priceTo: number | null,
  currency: Currency,
) {
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
  if (entry.priceFrom !== null && entry.priceTo !== null && entry.priceFrom !== entry.priceTo) {
    return `${entry.priceFrom}-${entry.priceTo}`;
  }

  return `${entry.priceFrom ?? entry.priceTo ?? "N/A"}`;
}

export function formatEntryDestination(entry: BrokerageEntry) {
  return `${entry.destinationPort}, ${entry.destinationCountry}`;
}

export function buildCanonicalView(entry: Omit<BrokerageEntry, "canonicalView">) {
  return [
    formatEntryTimestampCompact(entry.createdAt),
    `${entry.brokerCode} (${entry.brokerName})`,
    entry.commodityLabel.toUpperCase(),
    formatEntryVolumeCompact(entry.volumeFrom, entry.volumeTo),
    `${entry.basis} ${entry.destinationPort}`,
    entry.periodLabel,
    formatPriceCompact(entry.priceFrom, entry.priceTo, entry.currency),
  ].join(" / ");
}
