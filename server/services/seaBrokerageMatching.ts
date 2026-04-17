import type { SeaBrokerageEntryRow } from "@shared/schema";

export type SeaBrokerageMatchSuggestion = {
  id: string;
  bidEntry: SeaBrokerageEntryRow;
  offerEntry: SeaBrokerageEntryRow;
  score: number;
  confidenceLabel: "high confidence" | "medium confidence" | "weak match";
  priceDelta: number | null;
  reasons: string[];
};

type SeaBrokerageMatchOptions = {
  freshnessDays?: number;
  maxPriceDelta?: number | null;
};

function getPeriodOverlapScore(bidEntry: SeaBrokerageEntryRow, offerEntry: SeaBrokerageEntryRow) {
  if (bidEntry.periodStart && bidEntry.periodEnd && offerEntry.periodStart && offerEntry.periodEnd) {
    const bidStart = new Date(bidEntry.periodStart).getTime();
    const bidEnd = new Date(bidEntry.periodEnd).getTime();
    const offerStart = new Date(offerEntry.periodStart).getTime();
    const offerEnd = new Date(offerEntry.periodEnd).getTime();
    const overlaps = bidStart <= offerEnd && offerStart <= bidEnd;
    if (overlaps) {
      return { score: 1, reason: "Shipment windows overlap at least one day" };
    }
  }

  return { score: 0, reason: null as string | null };
}

function sameDeliveryPlace(bidEntry: SeaBrokerageEntryRow, offerEntry: SeaBrokerageEntryRow) {
  const parseCodes = (raw: string | null | undefined) =>
    String(raw || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  const bidCodes = new Set(parseCodes(bidEntry.destinationPortCode));
  const offerCodes = parseCodes(offerEntry.destinationPortCode);
  if (bidCodes.size && offerCodes.some((code) => bidCodes.has(code))) return true;

  return (bidEntry.destinationPort || "").trim().toUpperCase() ===
    (offerEntry.destinationPort || "").trim().toUpperCase();
}

function isWithinFreshnessWindow(entry: SeaBrokerageEntryRow, freshnessDays: number, now = Date.now()) {
  const createdAt = new Date(entry.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  const safeDays = Number.isFinite(freshnessDays) ? Math.max(1, Math.floor(freshnessDays)) : 7;
  const freshnessMs = safeDays * 24 * 60 * 60 * 1000;
  return createdAt >= now - freshnessMs;
}

function isEligibleStatus(entry: SeaBrokerageEntryRow) {
  const status = String(entry.entryStatus || "active").toLowerCase();
  return status === "active" || status === "needs_update";
}

function extractComparablePrice(entry: SeaBrokerageEntryRow): number | null {
  const raw = entry.price ?? entry.priceFrom;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCurrency(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function scoreBidOfferPair(
  bidEntry: SeaBrokerageEntryRow,
  offerEntry: SeaBrokerageEntryRow,
  options: SeaBrokerageMatchOptions = {},
): SeaBrokerageMatchSuggestion | null {
  if (bidEntry.commodity !== offerEntry.commodity) return null;
  if ((bidEntry.basis || "").toUpperCase() !== (offerEntry.basis || "").toUpperCase()) return null;
  if (!sameDeliveryPlace(bidEntry, offerEntry)) return null;

  const periodScore = getPeriodOverlapScore(bidEntry, offerEntry);
  if (periodScore.score === 0) return null;

  const maxPriceDelta =
    options.maxPriceDelta == null || !Number.isFinite(options.maxPriceDelta)
      ? null
      : Math.max(0, Number(options.maxPriceDelta));
  const bidPrice = extractComparablePrice(bidEntry);
  const offerPrice = extractComparablePrice(offerEntry);
  const comparableCurrencies =
    normalizeCurrency(bidEntry.currency) && normalizeCurrency(bidEntry.currency) === normalizeCurrency(offerEntry.currency);
  const priceDelta =
    bidPrice != null && offerPrice != null && comparableCurrencies
      ? Math.abs(offerPrice - bidPrice)
      : null;
  if (maxPriceDelta != null) {
    if (priceDelta == null || priceDelta > maxPriceDelta) {
      return null;
    }
  }

  const normalizedScore = 100;
  const reasons = [
    "Same commodity",
    "Same basis",
    "Same delivery place",
    periodScore.reason ?? "Shipment windows overlap at least one day",
  ];

  return {
    id: `${bidEntry.id}__${offerEntry.id}`,
    bidEntry,
    offerEntry,
    score: normalizedScore,
    confidenceLabel: "high confidence",
    priceDelta,
    reasons,
  };
}

export function generateSeaBrokerageMatchSuggestions(
  entries: SeaBrokerageEntryRow[],
  options: SeaBrokerageMatchOptions = {},
) {
  const freshnessDays =
    options.freshnessDays && Number.isFinite(options.freshnessDays)
      ? Math.max(1, Math.floor(options.freshnessDays))
      : 7;
  const activeEntries = entries.filter(
    (entry) => isWithinFreshnessWindow(entry, freshnessDays) && isEligibleStatus(entry),
  );
  const bids = activeEntries.filter((entry) => entry.type === "bid");
  const offers = activeEntries.filter((entry) => entry.type === "offer");
  const suggestions: SeaBrokerageMatchSuggestion[] = [];

  for (const bidEntry of bids) {
    for (const offerEntry of offers) {
      const suggestion = scoreBidOfferPair(bidEntry, offerEntry, options);
      if (suggestion) suggestions.push(suggestion);
    }
  }

  return suggestions.sort((a, b) => {
    return new Date(b.bidEntry.createdAt).getTime() - new Date(a.bidEntry.createdAt).getTime();
  });
}
