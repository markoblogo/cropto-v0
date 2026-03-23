import type { BrokerageEntry, FeedFilterState } from "../types";
import { formatEntryChartDay } from "./entryFormatting.service";

export const defaultFeedFilters: FeedFilterState = {
  entryType: "all",
  commodity: "all",
  basis: "all",
  brokerProfileId: "all",
  destinationCountry: "all",
  destinationPort: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

export function filterBrokerageEntries(entries: BrokerageEntry[], filters: FeedFilterState) {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const searchTerm = normalizeText(filters.search);
  const dateFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
  const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;
  const effectiveDateFrom = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
  const effectiveDateTo = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;

  return sortedEntries.filter((entry) => {
    const searchHaystack = [
      entry.canonicalView,
      entry.brokerName,
      entry.sellerName,
      entry.buyerName,
      entry.commodityLabel,
      entry.note,
    ]
      .map(normalizeText)
      .join(" ");

    const entryDate = new Date(entry.createdAt);

    return (
      (!searchTerm || searchHaystack.includes(searchTerm)) &&
      (filters.entryType === "all" || filters.entryType === entry.type) &&
      (filters.commodity === "all" || filters.commodity === entry.commodity) &&
      (filters.basis === "all" || filters.basis === entry.basis) &&
      (filters.brokerProfileId === "all" || filters.brokerProfileId === entry.brokerId) &&
      (filters.destinationCountry === "all" || filters.destinationCountry === entry.destinationCountry) &&
      (filters.destinationPort === "all" || filters.destinationPort === entry.destinationPort) &&
      (!effectiveDateFrom || entryDate >= effectiveDateFrom) &&
      (!effectiveDateTo || entryDate <= effectiveDateTo)
    );
  });
}

export function buildFeedAnalyticsSeries(entries: BrokerageEntry[]) {
  const buckets = new Map<
    string,
    { day: string; totalPrice: number; priceCount: number; bids: number; offers: number }
  >();

  for (const entry of entries) {
    const day = new Date(entry.createdAt).toISOString().slice(0, 10);
    const current = buckets.get(day) ?? {
      day,
      totalPrice: 0,
      priceCount: 0,
      bids: 0,
      offers: 0,
    };

    const priceValues = [entry.priceFrom, entry.priceTo].filter(
      (value): value is number => value !== null,
    );

    buckets.set(day, {
      ...current,
      bids: current.bids + (entry.type === "bid" ? 1 : 0),
      offers: current.offers + (entry.type === "offer" ? 1 : 0),
      totalPrice: current.totalPrice + priceValues.reduce((sum, value) => sum + value, 0),
      priceCount: current.priceCount + priceValues.length,
    });
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((bucket) => ({
      day: bucket.day,
      label: formatEntryChartDay(bucket.day),
      averagePrice: bucket.priceCount > 0 ? Number((bucket.totalPrice / bucket.priceCount).toFixed(2)) : 0,
      bids: bucket.bids,
      offers: bucket.offers,
    }));
}
