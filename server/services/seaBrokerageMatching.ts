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

function isWithinLast7Days(entry: SeaBrokerageEntryRow, now = Date.now()) {
  const createdAt = new Date(entry.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return createdAt >= now - sevenDaysMs;
}

function scoreBidOfferPair(
  bidEntry: SeaBrokerageEntryRow,
  offerEntry: SeaBrokerageEntryRow,
): SeaBrokerageMatchSuggestion | null {
  if (bidEntry.commodity !== offerEntry.commodity) return null;
  if ((bidEntry.basis || "").toUpperCase() !== (offerEntry.basis || "").toUpperCase()) return null;
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
    bidEntry,
    offerEntry,
    score: normalizedScore,
    confidenceLabel: "high confidence",
    priceDelta: null,
    reasons,
  };
}

export function generateSeaBrokerageMatchSuggestions(entries: SeaBrokerageEntryRow[]) {
  const activeEntries = entries.filter((entry) => isWithinLast7Days(entry));
  const bids = activeEntries.filter((entry) => entry.type === "bid");
  const offers = activeEntries.filter((entry) => entry.type === "offer");
  const suggestions: SeaBrokerageMatchSuggestion[] = [];

  for (const bidEntry of bids) {
    for (const offerEntry of offers) {
      const suggestion = scoreBidOfferPair(bidEntry, offerEntry);
      if (suggestion) suggestions.push(suggestion);
    }
  }

  return suggestions.sort((a, b) => {
    return new Date(b.bidEntry.createdAt).getTime() - new Date(a.bidEntry.createdAt).getTime();
  });
}
