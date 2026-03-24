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

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getMidPrice(entry: SeaBrokerageEntryRow) {
  const direct = toNumber(entry.price);
  if (direct !== null) return direct;

  const from = toNumber(entry.priceFrom);
  const to = toNumber(entry.priceTo);
  if (from !== null && to !== null) return (from + to) / 2;

  return from ?? to ?? null;
}

function getVolumeOverlapScore(bidEntry: SeaBrokerageEntryRow, offerEntry: SeaBrokerageEntryRow) {
  const overlapStart = Math.max(bidEntry.volumeFrom, offerEntry.volumeFrom);
  const overlapEnd = Math.min(bidEntry.volumeTo, offerEntry.volumeTo);

  if (overlapEnd >= overlapStart) {
    return { score: 16, reason: "Compatible volume ranges overlap" };
  }

  const gap = Math.min(
    Math.abs(bidEntry.volumeFrom - offerEntry.volumeTo),
    Math.abs(offerEntry.volumeFrom - bidEntry.volumeTo),
  );
  const reference = Math.max(bidEntry.volumeTo, offerEntry.volumeTo, 1);

  if (gap / reference <= 0.15) {
    return { score: 8, reason: "Volume ranges are close enough for partial execution" };
  }

  return { score: 0, reason: null as string | null };
}

function getPeriodOverlapScore(bidEntry: SeaBrokerageEntryRow, offerEntry: SeaBrokerageEntryRow) {
  if (bidEntry.periodStart && bidEntry.periodEnd && offerEntry.periodStart && offerEntry.periodEnd) {
    const bidStart = new Date(bidEntry.periodStart).getTime();
    const bidEnd = new Date(bidEntry.periodEnd).getTime();
    const offerStart = new Date(offerEntry.periodStart).getTime();
    const offerEnd = new Date(offerEntry.periodEnd).getTime();
    const overlaps = bidStart <= offerEnd && offerStart <= bidEnd;
    if (overlaps) {
      return { score: 16, reason: "Shipment windows overlap" };
    }
  }

  if (bidEntry.periodLabel.toLowerCase() === offerEntry.periodLabel.toLowerCase()) {
    return { score: 10, reason: "Period labels align" };
  }

  return { score: 0, reason: null as string | null };
}

function getPriceScore(bidEntry: SeaBrokerageEntryRow, offerEntry: SeaBrokerageEntryRow) {
  if ((bidEntry.currency || "").toUpperCase() !== (offerEntry.currency || "").toUpperCase()) {
    return {
      score: 0,
      delta: null,
      reason: "Currencies differ, reducing direct price comparability",
    };
  }

  const bidMid = getMidPrice(bidEntry);
  const offerMid = getMidPrice(offerEntry);
  if (bidMid === null || offerMid === null) {
    return {
      score: 4,
      delta: null,
      reason: "Price is partially specified",
    };
  }

  const delta = Math.abs(bidMid - offerMid);
  const reference = Math.max((bidMid + offerMid) / 2, 1);
  const deltaRatio = delta / reference;

  if (bidMid >= offerMid) {
    if (deltaRatio <= 0.01) return { score: 28, delta, reason: "Price ranges are directly executable" };
    if (deltaRatio <= 0.03) return { score: 22, delta, reason: "Bid and offer are commercially close" };
  }

  if (deltaRatio <= 0.01) return { score: 24, delta, reason: "Tight price alignment" };
  if (deltaRatio <= 0.03) return { score: 18, delta, reason: "Small price delta" };
  if (deltaRatio <= 0.06) return { score: 10, delta, reason: "Moderate price delta" };

  return { score: 4, delta, reason: "Wide price delta" };
}

function getConfidenceLabel(score: number): SeaBrokerageMatchSuggestion["confidenceLabel"] {
  if (score >= 75) return "high confidence";
  if (score >= 55) return "medium confidence";
  return "weak match";
}

function scoreBidOfferPair(
  bidEntry: SeaBrokerageEntryRow,
  offerEntry: SeaBrokerageEntryRow,
): SeaBrokerageMatchSuggestion | null {
  if (bidEntry.commodity !== offerEntry.commodity) return null;

  let score = 35;
  const reasons: string[] = ["Same commodity"];

  if ((bidEntry.basis || "").toUpperCase() === (offerEntry.basis || "").toUpperCase()) {
    score += 18;
    reasons.push("Same basis");
  }

  if ((bidEntry.destinationPort || "").toUpperCase() === (offerEntry.destinationPort || "").toUpperCase()) {
    score += 18;
    reasons.push("Same destination port");
  } else if (
    (bidEntry.destinationCountryCode || bidEntry.destinationCountry || "").toUpperCase() ===
    (offerEntry.destinationCountryCode || offerEntry.destinationCountry || "").toUpperCase()
  ) {
    score += 12;
    reasons.push("Same destination country");
  }

  const periodScore = getPeriodOverlapScore(bidEntry, offerEntry);
  score += periodScore.score;
  if (periodScore.reason) reasons.push(periodScore.reason);

  const volumeScore = getVolumeOverlapScore(bidEntry, offerEntry);
  score += volumeScore.score;
  if (volumeScore.reason) reasons.push(volumeScore.reason);

  const priceScore = getPriceScore(bidEntry, offerEntry);
  score += priceScore.score;
  if (priceScore.reason) reasons.push(priceScore.reason);

  if ((bidEntry.transportType || "").toUpperCase() === (offerEntry.transportType || "").toUpperCase()) {
    score += 4;
    reasons.push("Same transport type");
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  if (normalizedScore < 35) return null;

  return {
    id: `${bidEntry.id}__${offerEntry.id}`,
    bidEntry,
    offerEntry,
    score: normalizedScore,
    confidenceLabel: getConfidenceLabel(normalizedScore),
    priceDelta: priceScore.delta,
    reasons,
  };
}

export function generateSeaBrokerageMatchSuggestions(entries: SeaBrokerageEntryRow[]) {
  const bids = entries.filter((entry) => entry.type === "bid");
  const offers = entries.filter((entry) => entry.type === "offer");
  const suggestions: SeaBrokerageMatchSuggestion[] = [];

  for (const bidEntry of bids) {
    for (const offerEntry of offers) {
      const suggestion = scoreBidOfferPair(bidEntry, offerEntry);
      if (suggestion) suggestions.push(suggestion);
    }
  }

  return suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.bidEntry.createdAt).getTime() - new Date(a.bidEntry.createdAt).getTime();
  });
}
