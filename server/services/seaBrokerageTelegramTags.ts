export type SeaBrokerageTelegramTagKind =
  | "offer"
  | "bid"
  | "match"
  | "trade"
  | "market_trade"
  | "market_report"
  | "potential";

/**
 * Canonical hashtag registry for Sea Brokerage Telegram publishing.
 *
 * Rule:
 * - idea entities use *_idea tags
 * - market/report entities use market_* tags
 * - future or optional matching-intent stream can use #potential
 */
export const SEA_BROKERAGE_TELEGRAM_TAGS: Record<SeaBrokerageTelegramTagKind, string> = {
  offer: "#offer_idea",
  bid: "#bid_idea",
  match: "#match_idea",
  trade: "#trade_idea",
  market_trade: "#market_traded",
  market_report: "#market_price",
  potential: "#potential",
};

export function resolveSeaBrokerageTelegramTag(kind: SeaBrokerageTelegramTagKind): string {
  return SEA_BROKERAGE_TELEGRAM_TAGS[kind];
}

