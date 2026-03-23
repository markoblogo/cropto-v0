import type { BrokerageEntry, MatchSuggestion } from "../types";

function getMidPrice(entry: BrokerageEntry) {
  if (entry.price !== null && entry.price !== undefined) {
    return entry.price;
  }

  if (entry.priceFrom !== null && entry.priceTo !== null) {
    return (entry.priceFrom + entry.priceTo) / 2;
  }

  return entry.priceFrom ?? entry.priceTo ?? null;
}

function getVolumeOverlapScore(bidEntry: BrokerageEntry, offerEntry: BrokerageEntry) {
  const overlapStart = Math.max(bidEntry.volumeFrom, offerEntry.volumeFrom);
  const overlapEnd = Math.min(bidEntry.volumeTo, offerEntry.volumeTo);

  if (overlapEnd >= overlapStart) {
    return {
      score: 16,
      reason: "Compatible volume ranges overlap",
    };
  }

  const gap = Math.min(
    Math.abs(bidEntry.volumeFrom - offerEntry.volumeTo),
    Math.abs(offerEntry.volumeFrom - bidEntry.volumeTo),
  );
  const reference = Math.max(bidEntry.volumeTo, offerEntry.volumeTo, 1);

  if (gap / reference <= 0.15) {
    return {
      score: 8,
      reason: "Volume ranges are close enough for partial execution",
    };
  }

  return {
    score: 0,
    reason: null,
  };
}

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
        score: 16,
        reason: "Shipment windows overlap",
      };
    }
  }

  if (bidEntry.periodLabel.toLowerCase() === offerEntry.periodLabel.toLowerCase()) {
    return {
      score: 10,
      reason: "Period labels align",
    };
  }

  return {
    score: 0,
    reason: null,
  };
}

function getPriceScore(bidEntry: BrokerageEntry, offerEntry: BrokerageEntry) {
  if (bidEntry.currency !== offerEntry.currency) {
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
    if (deltaRatio <= 0.01) {
      return { score: 28, delta, reason: "Price ranges are directly executable" };
    }
    if (deltaRatio <= 0.03) {
      return { score: 22, delta, reason: "Bid and offer are commercially close" };
    }
  }

  if (deltaRatio <= 0.01) {
    return { score: 24, delta, reason: "Tight price alignment" };
  }
  if (deltaRatio <= 0.03) {
    return { score: 18, delta, reason: "Small price delta" };
  }
  if (deltaRatio <= 0.06) {
    return { score: 10, delta, reason: "Moderate price delta" };
  }

  return { score: 4, delta, reason: "Wide price delta" };
}

function getConfidenceLabel(score: number): MatchSuggestion["confidenceLabel"] {
  if (score >= 75) return "high confidence";
  if (score >= 55) return "medium confidence";
  return "weak match";
}

function scoreBidOfferPair(
  bidEntry: BrokerageEntry,
  offerEntry: BrokerageEntry,
): MatchSuggestion | null {
  if (bidEntry.commodity !== offerEntry.commodity) {
    return null;
  }

  // Start with a commodity-match floor, then add deterministic weights for commercial fit.
  let score = 35;
  const reasons: string[] = ["Same commodity"];

  if (bidEntry.basis === offerEntry.basis) {
    score += 18;
    reasons.push("Same basis");
  }

  if (bidEntry.destinationPort === offerEntry.destinationPort) {
    score += 18;
    reasons.push("Same destination port");
  } else if (bidEntry.destinationCountry === offerEntry.destinationCountry) {
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

  if (bidEntry.transportType === offerEntry.transportType) {
    score += 4;
    reasons.push("Same transport type");
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  if (normalizedScore < 35) {
    return null;
  }

  return {
    id: `${bidEntry.id}__${offerEntry.id}`,
    bidEntryId: bidEntry.id,
    offerEntryId: offerEntry.id,
    bidEntry,
    offerEntry,
    score: normalizedScore,
    scoreLabel: `${normalizedScore}/100`,
    confidenceLabel: getConfidenceLabel(normalizedScore),
    priceDelta: priceScore.delta,
    priceDeltaLabel:
      priceScore.delta === null ? "N/A" : `${priceScore.delta.toFixed(2)} ${bidEntry.currency}`,
    reasons,
    matchedAt: null,
  };
}

export function generateMatchSuggestions(entries: BrokerageEntry[]) {
  const bids = entries.filter((entry) => entry.type === "bid");
  const offers = entries.filter((entry) => entry.type === "offer");
  const suggestions: MatchSuggestion[] = [];

  for (const bidEntry of bids) {
    for (const offerEntry of offers) {
      const suggestion = scoreBidOfferPair(bidEntry, offerEntry);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
  }

  return suggestions.sort(
    (a, b) => b.score - a.score || b.bidEntry.createdAt.localeCompare(a.bidEntry.createdAt),
  );
}

export function generateContextualMatchSuggestions(
  selectedEntry: BrokerageEntry,
  oppositeEntries: BrokerageEntry[],
) {
  const suggestions = oppositeEntries
    .map((entry) =>
      selectedEntry.type === "bid"
        ? scoreBidOfferPair(selectedEntry, entry)
        : scoreBidOfferPair(entry, selectedEntry),
    )
    .filter((suggestion): suggestion is MatchSuggestion => suggestion !== null);

  return suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.offerEntry.createdAt).getTime() - new Date(a.offerEntry.createdAt).getTime(),
  );
}
