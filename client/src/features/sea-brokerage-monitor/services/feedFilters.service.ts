import {
  formatEntryDestinationCompactDisplay,
  getCommodityCompactDisplay,
  getCountryCompactDisplay,
  getPortPlaceCompactDisplay,
  getPaymentTermCompactDisplay,
  getPaymentTermDisplayLabel,
} from "./displayStandards";
import type { BrokerageEntry, FeedFilterState } from "../types";
import { formatEntryChartDay } from "./entryFormatting.service";

export const defaultFeedFilters: FeedFilterState = {
  entryType: "all",
  commodity: "all",
  basis: "all",
  brokerProfileId: "all",
  businessUnits: [],
  originCountries: [],
  currencies: [],
  transportModes: [],
  originCountry: "all",
  deliveryPlace: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function resolveDestinationPortCodes(entry: BrokerageEntry) {
  if (Array.isArray(entry.destinationPortCodes) && entry.destinationPortCodes.length) {
    return entry.destinationPortCodes;
  }
  return String(entry.destinationPortCode || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mapTransportTypeToMode(transportType: string | null | undefined) {
  const normalized = String(transportType || "").toLowerCase();
  if (normalized === "truck" || normalized === "rail" || normalized === "truck/rail") return "land";
  if (normalized === "barge") return "river";
  if (normalized === "container") return "container";
  if (normalized === "vessel" || normalized === "coaster" || normalized === "handysize" || normalized === "supramax" || normalized === "panamax" || normalized === "capesize") return "bulk_sea";
  return "land";
}

function normalizeCountryFilterCandidates(entry: BrokerageEntry) {
  const candidates = new Set<string>();
  const code = normalizeText(entry.originCountryCode);
  const label = normalizeText(entry.originCountry);
  if (code) {
    candidates.add(code);
  }
  if (label) {
    candidates.add(label);
  }
  return candidates;
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
      entry.originCountry,
      getCountryCompactDisplay(entry.originCountryCode ?? entry.originCountry),
      entry.commodityLabel,
      getCommodityCompactDisplay(entry.commodity, entry.commodityLabel),
      entry.paymentTerms,
      getPaymentTermCompactDisplay(entry.paymentTerms),
      getPaymentTermDisplayLabel(entry.paymentTerms),
      entry.destinationPort,
      entry.destinationCountry,
      resolveDestinationPortCodes(entry).join(" "),
      getCountryCompactDisplay(entry.destinationCountryCode ?? entry.destinationCountry),
      entry.destinationPortCode ? getPortPlaceCompactDisplay(entry.destinationPortCode) : null,
      formatEntryDestinationCompactDisplay(entry),
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
      (filters.businessUnits.length === 0 ||
        filters.businessUnits.includes(normalizeText(entry.businessUnitCode))) &&
      (filters.currencies.length === 0 || filters.currencies.includes(entry.currency)) &&
      (filters.transportModes.length === 0 ||
        filters.transportModes.includes(mapTransportTypeToMode(entry.transportType))) &&
      (filters.originCountries.length === 0
        ? filters.originCountry === "all" ||
          filters.originCountry === (entry.originCountryCode ?? entry.originCountry)
        : Array.from(normalizeCountryFilterCandidates(entry)).some((candidate) =>
            filters.originCountries.includes(candidate),
          )) &&
      (filters.deliveryPlace === "all" ||
        resolveDestinationPortCodes(entry).includes(filters.deliveryPlace) ||
        filters.deliveryPlace === (entry.destinationPortCode ?? entry.destinationPort) ||
        filters.deliveryPlace === (entry.destinationCountryCode ?? entry.destinationCountry)) &&
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
