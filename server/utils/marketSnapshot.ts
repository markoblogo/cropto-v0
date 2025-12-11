import type { Option } from "@shared/schema";

export interface MarketOptionRow {
  id: string;
  commodity: string;
  commoditySlug?: string | null;
  expiryWindowLabel: string;
  expirationDate: string | null;
  type: "CALL" | "PUT";
  qtyTons: number;
  strikePerTon: number;
  premiumPerTon: number;
  side: "SHORT" | "LONG";
}

function formatExpiryLabel(option: Pick<Option, "expiryWindow" | "windowStart" | "expirationDate">) {
  const existing = option.expiryWindow?.trim();
  if (existing) return existing;

  const date = option.windowStart || option.expirationDate;
  if (!date) return "TBD";

  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return formatter.format(new Date(date));
}

export function mapOptionToMarketRow(
  option: Option & { indexName?: string | null; indexSlug?: string | null; commodityLabel?: string | null }
): MarketOptionRow {
  const qtyTons = Number(option.qty ?? 0);
  const strikePerTon = Number(option.strike ?? 0);
  const premiumPerTon = Number(option.premium ?? 0);

  return {
    id: option.id,
    commodity:
      option.commodityLabel ||
      option.indexName ||
      option.commodity ||
      option.indexSlug ||
      "Unknown",
    commoditySlug: option.commodity || option.indexSlug || null,
    expiryWindowLabel: formatExpiryLabel(option),
    expirationDate: option.expirationDate ? new Date(option.expirationDate).toISOString() : null,
    type: option.type as "CALL" | "PUT",
    qtyTons: Number.isFinite(qtyTons) ? qtyTons : 0,
    strikePerTon: Number.isFinite(strikePerTon) ? strikePerTon : 0,
    premiumPerTon: Number.isFinite(premiumPerTon) ? premiumPerTon : 0,
    side: "SHORT",
  };
}

