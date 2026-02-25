import type {
  GrainMarketInstrumentKey,
  GrainMarketQuoteNormalized,
  GrainMarketStatus,
  GrainMarketWidgetItem,
} from "./types";

const STATUS_RANK: Record<GrainMarketStatus, number> = {
  LIVE: 6,
  REFRESH: 5,
  DELAYED: 4,
  INDICATIVE: 3,
  FALLBACK: 2,
  OFFLINE: 1,
};

export function mergeStatus(a: GrainMarketStatus, b: GrainMarketStatus): GrainMarketStatus {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

export function quoteToWidget(quote: GrainMarketQuoteNormalized): GrainMarketWidgetItem {
  return {
    instrumentKey: quote.key,
    venue: quote.venue,
    title: quote.shortName,
    subtitle: quote.displayName,
    status: quote.status,
    sourceName: quote.sourceName,
    sourceAttribution: quote.sourceAttribution,
    sourceUrl: quote.sourceUrl,
    updatedAt: quote.updatedAt,
    asOf: quote.asOf,
    timeframe: quote.timeframe,
    valueCurrent: quote.valueCurrent,
    valueChange: quote.valueChange,
    valueChangePct: quote.valueChangePct,
    currency: quote.currency,
    unit: quote.unit,
    series: quote.series,
    notes: quote.notes,
    fallbackReason: quote.fallbackReason,
    venueBadge: quote.venue,
    marketLabel: quote.venue === "CBOT" ? "US Grains" : "EU Grains",
  };
}

export function findQuote(
  quotes: GrainMarketQuoteNormalized[],
  key: GrainMarketInstrumentKey,
): GrainMarketQuoteNormalized | undefined {
  return quotes.find((quote) => quote.key === key);
}
