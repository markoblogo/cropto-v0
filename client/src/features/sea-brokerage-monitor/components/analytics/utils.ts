import type { BrokerageEntry } from "../../types";

export function getEntryMidPrice(entry: BrokerageEntry): number | null {
  if (typeof entry.price === "number") return entry.price;
  if (typeof entry.priceFrom === "number" && typeof entry.priceTo === "number") {
    return (entry.priceFrom + entry.priceTo) / 2;
  }
  if (typeof entry.priceFrom === "number") return entry.priceFrom;
  if (typeof entry.priceTo === "number") return entry.priceTo;
  return null;
}
