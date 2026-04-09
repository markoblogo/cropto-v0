import type { BrokerageEntry, MatchSuggestion } from "../types";

function getPeriodOverlapScore(bidEntry: BrokerageEntry, offerEntry: BrokerageEntry) {
  if (
    bidEntry.periodStart &&
    bidEntry.periodEnd &&
    offerEntry.periodStart &&
    offerEntry.periodEnd
  ) {
    const bidStart = new Date(bidEntry.periodStart).getTime();
    const bidEnd = new Date(bidEntry.periodEnd).getTime();
    const offerStart = new Date(offerEntry.periodStart).getTime();
    const offerEnd = new Date(offerEntry.periodEnd).getTime();

    const overlaps = bidStart <= offerEnd && offerStart <= bidEnd;
    if (overlaps) {
      return {
        score: 1,
        reason: "Shipment windows overlap at least one day",
      };
    }
  }

  return {
    score: 0,
    reason: null,
  };
}

function sameDeliveryPlace(bidEntry: BrokerageEntry, offerEntry: BrokerageEntry) {
  const parseCodes = (entry: BrokerageEntry) => {
    if (Array.isArray(entry.destinationPortCodes) && entry.destinationPortCodes.length) {
      return entry.destinationPortCodes;
    }
    return String(entry.destinationPortCode || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  };
  const bidCodes = new Set(parseCodes(bidEntry));
  const offerCodes = parseCodes(offerEntry);
  if (bidCodes.size && offerCodes.some((code) => bidCodes.has(code))) return true;

  return (bidEntry.destinationPort || "").trim().toUpperCase() ===
    (offerEntry.destinationPort || "").trim().toUpperCase();
}

function isWithinLast7Days(entry: BrokerageEntry, now = Date.now()) {
  const createdAt = new Date(entry.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return createdAt >= now - sevenDaysMs;
}

function isEligibleStatus(entry: BrokerageEntry) {
  const status = String(entry.entryStatus || "active").toLowerCase();
  return status === "active" || status === "needs_update";
}

function scoreBidOfferPair(
  bidEntry: BrokerageEntry,
  offerEntry: BrokerageEntry,
): MatchSuggestion | null {
  if (bidEntry.commodity !== offerEntry.commodity) return null;
  if (bidEntry.basis !== offerEntry.basis) return null;
  if (!sameDeliveryPlace(bidEntry, offerEntry)) return null;

  const periodScore = getPeriodOverlapScore(bidEntry, offerEntry);
  if (periodScore.score === 0) return null;

  const normalizedScore = 100;
  const reasons = [
    "Same commodity",
    "Same basis",
    "Same delivery place",
    periodScore.reason ?? "Shipment windows overlap at least one day",
  ];

  return {
    id: `${bidEntry.id}__${offerEntry.id}`,
    bidEntryId: bidEntry.id,
    offerEntryId: offerEntry.id,
    bidEntry,
    offerEntry,
    score: normalizedScore,
    scoreLabel: `${normalizedScore}/100`,
    confidenceLabel: "high confidence",
    priceDelta: null,
    priceDeltaLabel: "N/A",
    reasons,
    matchedAt: null,
  };
}

export function generateMatchSuggestions(entries: BrokerageEntry[]) {
  const activeEntries = entries.filter(
    (entry) => isWithinLast7Days(entry) && isEligibleStatus(entry),
  );
  const bids = activeEntries.filter((entry) => entry.type === "bid");
  const offers = activeEntries.filter((entry) => entry.type === "offer");
  const suggestions: MatchSuggestion[] = [];

  for (const bidEntry of bids) {
    for (const offerEntry of offers) {
      const suggestion = scoreBidOfferPair(bidEntry, offerEntry);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
  }

  return suggestions.sort((a, b) => b.bidEntry.createdAt.localeCompare(a.bidEntry.createdAt));
}

export function generateContextualMatchSuggestions(
  selectedEntry: BrokerageEntry,
  oppositeEntries: BrokerageEntry[],
) {
  if (!isWithinLast7Days(selectedEntry) || !isEligibleStatus(selectedEntry)) {
    return [];
  }

  const suggestions = oppositeEntries
    .filter((entry) => isWithinLast7Days(entry) && isEligibleStatus(entry))
    .map((entry) =>
      selectedEntry.type === "bid"
        ? scoreBidOfferPair(selectedEntry, entry)
        : scoreBidOfferPair(entry, selectedEntry),
    )
    .filter((suggestion): suggestion is MatchSuggestion => suggestion !== null);

  return suggestions.sort(
    (a, b) =>
      new Date(b.offerEntry.createdAt).getTime() - new Date(a.offerEntry.createdAt).getTime(),
  );
}
